<?php
/**
 * Plugin Name: Make Santa Fe CRM Bridge
 * Description: Exposes authenticated sync endpoints for the standalone Make Santa Fe CRM.
 * Version: 0.2.0
 * Author: Make Santa Fe
 */

if (! defined('ABSPATH')) {
	exit;
}

class Make_Santa_Fe_CRM_Bridge {
	const OPTION_TOKEN = 'msf_crm_bridge_token';
	const OPTION_ENABLED_GRAVITY_FORMS = 'msf_crm_enabled_gravity_forms';
	const OPTION_DONATION_GRAVITY_FORMS = 'msf_crm_donation_gravity_forms';
	const OPTION_GRAVITY_FORM_INTERACTIONS = 'msf_crm_gravity_form_interactions';
	const REST_NAMESPACE = 'make-santa-fe-crm/v1';

	private $membership_product_ids = null;
	private $gravity_form_definitions = array();

	public function __construct() {
		add_action('rest_api_init', array($this, 'register_routes'));
		add_action('admin_menu', array($this, 'register_settings_page'));
		add_action('admin_init', array($this, 'register_settings'));
	}

	public function register_routes() {
		register_rest_route(
			self::REST_NAMESPACE,
			'/auth/exchange',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array($this, 'handle_auth_exchange'),
					'permission_callback' => array($this, 'can_exchange_auth'),
				),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/sync/(?P<source>[a-z_-]+)',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array($this, 'handle_sync_source'),
					'permission_callback' => array($this, 'allow_bridge_request'),
				),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/metadata/(?P<source>[a-z_-]+)',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array($this, 'handle_metadata_source'),
					'permission_callback' => array($this, 'allow_bridge_request'),
				),
			)
		);
	}

	public function register_settings_page() {
		add_options_page(
			'Make Santa Fe CRM',
			'Make Santa Fe CRM',
			'manage_options',
			'make-santa-fe-crm',
			array($this, 'render_settings_page')
		);
	}

	public function register_settings() {
		register_setting(
			'make_santa_fe_crm',
			self::OPTION_TOKEN,
			array(
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
				'default'           => '',
			)
		);

		register_setting(
			'make_santa_fe_crm',
			self::OPTION_ENABLED_GRAVITY_FORMS,
			array(
				'type'              => 'array',
				'sanitize_callback' => array($this, 'sanitize_gravity_form_ids'),
				'default'           => array(),
			)
		);

		register_setting(
			'make_santa_fe_crm',
			self::OPTION_DONATION_GRAVITY_FORMS,
			array(
				'type'              => 'array',
				'sanitize_callback' => array($this, 'sanitize_gravity_form_ids'),
				'default'           => array(),
			)
		);

		register_setting(
			'make_santa_fe_crm',
			self::OPTION_GRAVITY_FORM_INTERACTIONS,
			array(
				'type'              => 'array',
				'sanitize_callback' => array($this, 'sanitize_gravity_form_interactions'),
				'default'           => array(),
			)
		);
	}

	public function sanitize_gravity_form_ids($value) {
		if (! is_array($value)) {
			return array();
		}

		$ids = array_map('absint', $value);
		$ids = array_values(array_unique(array_filter($ids)));

		return $ids;
	}

	public function sanitize_gravity_form_interactions($value) {
		$catalog = $this->get_gravity_form_interaction_catalog();
		if (! is_array($value)) {
			return array();
		}

		$sanitized = array();
		foreach ($value as $form_id => $interaction_key) {
			$normalized_form_id = absint($form_id);
			if (! $normalized_form_id) {
				continue;
			}

			$normalized_key = sanitize_key((string) $interaction_key);
			if (! isset($catalog[ $normalized_key ])) {
				$normalized_key = 'disabled';
			}

			$sanitized[ (string) $normalized_form_id ] = $normalized_key;
		}

		return $sanitized;
	}

	public function render_settings_page() {
		if (! current_user_can('manage_options')) {
			return;
		}

		$gravity_forms                 = $this->get_gravity_forms_for_settings();
		$gravity_form_interaction_map  = $this->get_gravity_form_interactions();
		$gravity_form_interaction_menu = $this->get_gravity_form_interaction_catalog();
		?>
		<div class="wrap">
			<h1>Make Santa Fe CRM Bridge</h1>
			<p>Use the settings below to control which WordPress data sources are exposed to the standalone CRM.</p>
			<form method="post" action="options.php">
				<?php
				settings_fields('make_santa_fe_crm');
				do_settings_sections('make_santa_fe_crm');
				?>
					<table class="form-table" role="presentation">
						<tr>
							<th scope="row"><label for="<?php echo esc_attr(self::OPTION_TOKEN); ?>">Bridge Token</label></th>
						<td>
							<input
								id="<?php echo esc_attr(self::OPTION_TOKEN); ?>"
								name="<?php echo esc_attr(self::OPTION_TOKEN); ?>"
								type="text"
								class="regular-text code"
								value="<?php echo esc_attr($this->get_bridge_token()); ?>"
							/>
							<p class="description">You can also define <code>MSF_CRM_BRIDGE_TOKEN</code> in <code>wp-config.php</code>.</p>
							</td>
						</tr>
						<tr>
							<th scope="row">Gravity Forms Interaction Mapping</th>
							<td>
								<?php if (! class_exists('GFAPI')) : ?>
									<p class="description">Gravity Forms is not active on this site, so there are no forms to map.</p>
								<?php elseif (empty($gravity_forms)) : ?>
									<p class="description">No Gravity Forms were found.</p>
								<?php else : ?>
									<p class="description">Choose what each form represents. Forms set to Do not sync stay out of the CRM entirely.</p>
									<div style="display:grid;gap:12px;margin-top:12px;">
										<?php foreach ($gravity_forms as $form) : ?>
											<?php $selected_interaction = isset($gravity_form_interaction_map[(string) $form['id']]) ? $gravity_form_interaction_map[(string) $form['id']] : $this->get_gravity_form_interaction_key((int) $form['id']); ?>
											<div style="display:grid;grid-template-columns:minmax(220px,1.4fr) minmax(220px,1fr);gap:14px;align-items:center;padding:12px 14px;border:1px solid #dcdcde;">
												<div>
													<strong><?php echo esc_html($form['title']); ?></strong>
													<div style="color:#646970;">Form ID <?php echo esc_html((string) $form['id']); ?></div>
												</div>
												<label>
													<span class="screen-reader-text"><?php echo esc_html($form['title']); ?> interaction type</span>
													<select name="<?php echo esc_attr(self::OPTION_GRAVITY_FORM_INTERACTIONS); ?>[<?php echo esc_attr((string) $form['id']); ?>]">
														<?php foreach ($gravity_form_interaction_menu as $interaction_key => $interaction) : ?>
															<option value="<?php echo esc_attr($interaction_key); ?>" <?php selected($selected_interaction, $interaction_key); ?>>
																<?php echo esc_html($interaction['label']); ?>
															</option>
														<?php endforeach; ?>
													</select>
												</label>
											</div>
										<?php endforeach; ?>
									</div>
									<p class="description" style="margin-top:10px;">Donation forms will emit donor events with extracted amounts. The other options classify the interaction directly in the bridge so the CRM does not need extra mapping rules.</p>
								<?php endif; ?>
							</td>
						</tr>
					</table>
					<?php submit_button(); ?>
				</form>
		</div>
		<?php
	}

	public function can_exchange_auth() {
		return current_user_can('read');
	}

	public function handle_auth_exchange() {
		$user = wp_get_current_user();
		return rest_ensure_response(
			array(
				'user' => array(
					'id'    => (int) $user->ID,
					'name'  => $user->display_name,
					'email' => $user->user_email,
				),
			)
		);
	}

	public function allow_bridge_request(WP_REST_Request $request) {
		$token = $request->get_header('x-msfcrm-token');
		if (! is_string($token) || '' === trim($token)) {
			return new WP_Error('msf_crm_missing_token', 'Missing bridge token.', array('status' => 401));
		}

		if (! hash_equals($this->get_bridge_token(), trim($token))) {
			return new WP_Error('msf_crm_bad_token', 'Invalid bridge token.', array('status' => 403));
		}

		return true;
	}

	public function handle_sync_source(WP_REST_Request $request) {
		$source = $this->normalize_source($request['source']);
		$mode   = strtoupper((string) $request->get_param('mode'));
		$mode   = 'BACKFILL' === $mode ? 'BACKFILL' : 'INCREMENTAL';
		$page   = max(1, (int) $request->get_param('page'));
		$limit  = max(1, min(250, (int) $request->get_param('limit') ?: 100));
		$cursor = sanitize_text_field((string) $request->get_param('cursor'));

		switch ($source) {
			case 'woocommerce':
				$payload = $this->get_woocommerce_feed($mode, $cursor, $page, $limit);
				break;
			case 'gravity_forms':
				$payload = $this->get_gravity_forms_feed($mode, $cursor, $page, $limit);
				break;
			case 'sign_in':
				$payload = $this->get_sign_in_feed($mode, $cursor, $page, $limit);
				break;
			case 'reservations':
				$payload = $this->get_reservations_feed($mode, $cursor, $page, $limit);
				break;
			case 'newsletter':
				$payload = $this->get_newsletter_feed($mode, $cursor, $page, $limit);
				break;
			default:
				return new WP_Error('msf_crm_unknown_source', 'Unknown source.', array('status' => 404));
		}

		return rest_ensure_response($payload);
	}

	public function handle_metadata_source(WP_REST_Request $request) {
		$source = $this->normalize_source($request['source']);

		switch ($source) {
			case 'woocommerce':
				$items = $this->get_woocommerce_metadata();
				break;
			case 'gravity_forms':
				$items = $this->get_gravity_forms_metadata();
				break;
			case 'sign_in':
				$items = $this->get_sign_in_metadata();
				break;
			case 'reservations':
				$items = $this->get_reservations_metadata();
				break;
			case 'newsletter':
				$items = $this->get_newsletter_metadata();
				break;
			default:
				return new WP_Error('msf_crm_unknown_source', 'Unknown source.', array('status' => 404));
		}

		return rest_ensure_response(
			array(
				'source' => strtoupper($source),
				'items'  => array_values($items),
			)
		);
	}

	private function get_bridge_token() {
		$defined = defined('MSF_CRM_BRIDGE_TOKEN') ? MSF_CRM_BRIDGE_TOKEN : '';
		return $defined ? $defined : (string) get_option(self::OPTION_TOKEN, '');
	}

	private function get_enabled_gravity_form_ids() {
		$value = get_option(self::OPTION_ENABLED_GRAVITY_FORMS, array());
		return $this->sanitize_gravity_form_ids($value);
	}

	private function get_donation_gravity_form_ids() {
		$value = get_option(self::OPTION_DONATION_GRAVITY_FORMS, array());
		return $this->sanitize_gravity_form_ids($value);
	}

	private function get_gravity_form_interaction_catalog() {
		return array(
			'disabled' => array(
				'label'          => 'Do not sync',
				'eventKind'      => null,
				'laneKey'        => null,
				'roleKey'        => null,
				'tag'            => null,
				'titlePrefix'    => 'Gravity Form',
				'summaryPrefix'  => 'Form',
				'requiresAmount' => false,
			),
			'form_submission' => array(
				'label'          => 'General submission',
				'eventKind'      => 'form_submission',
				'laneKey'        => 'OTHER',
				'roleKey'        => null,
				'tag'            => 'form_submission',
				'titlePrefix'    => 'Gravity Form',
				'summaryPrefix'  => 'Form',
				'requiresAmount' => false,
			),
			'donation' => array(
				'label'          => 'Donation',
				'eventKind'      => 'donation',
				'laneKey'        => 'DONOR',
				'roleKey'        => 'donor',
				'tag'            => 'donation',
				'titlePrefix'    => 'Donation via',
				'summaryPrefix'  => 'Donation form',
				'requiresAmount' => true,
			),
			'membership' => array(
				'label'          => 'Membership',
				'eventKind'      => 'membership_interest',
				'laneKey'        => 'MEMBER',
				'roleKey'        => 'member',
				'tag'            => 'membership',
				'titlePrefix'    => 'Membership form',
				'summaryPrefix'  => 'Membership form',
				'requiresAmount' => false,
			),
			'volunteer' => array(
				'label'          => 'Volunteer',
				'eventKind'      => 'volunteer_interest',
				'laneKey'        => 'VOLUNTEER',
				'roleKey'        => 'volunteer',
				'tag'            => 'volunteer',
				'titlePrefix'    => 'Volunteer form',
				'summaryPrefix'  => 'Volunteer form',
				'requiresAmount' => false,
			),
			'class' => array(
				'label'          => 'Class',
				'eventKind'      => 'class_registration',
				'laneKey'        => 'CLASS',
				'roleKey'        => null,
				'tag'            => 'class',
				'titlePrefix'    => 'Class form',
				'summaryPrefix'  => 'Class form',
				'requiresAmount' => false,
			),
			'community_event' => array(
				'label'          => 'Community event',
				'eventKind'      => 'community_event_registration',
				'laneKey'        => 'COMMUNITY_EVENT',
				'roleKey'        => null,
				'tag'            => 'community_event',
				'titlePrefix'    => 'Community event form',
				'summaryPrefix'  => 'Community event form',
				'requiresAmount' => false,
			),
			'email_signup' => array(
				'label'          => 'Email signup',
				'eventKind'      => 'email_signup',
				'laneKey'        => 'EMAIL',
				'roleKey'        => null,
				'tag'            => 'email_signup',
				'titlePrefix'    => 'Email signup form',
				'summaryPrefix'  => 'Email signup form',
				'requiresAmount' => false,
			),
		);
	}

	private function get_gravity_form_interactions() {
		$value = get_option(self::OPTION_GRAVITY_FORM_INTERACTIONS, array());
		return $this->sanitize_gravity_form_interactions($value);
	}

	private function get_gravity_form_interaction_key($form_id) {
		$form_id      = absint($form_id);
		$interactions = $this->get_gravity_form_interactions();
		$catalog      = $this->get_gravity_form_interaction_catalog();

		if ($form_id && isset($interactions[(string) $form_id]) && isset($catalog[$interactions[(string) $form_id]])) {
			return $interactions[(string) $form_id];
		}

		if ($this->gravity_form_is_donation($form_id)) {
			return 'donation';
		}

		if ($this->gravity_form_is_enabled($form_id)) {
			return 'form_submission';
		}

		return 'disabled';
	}

	private function get_gravity_form_interaction_config($form_id) {
		$catalog = $this->get_gravity_form_interaction_catalog();
		$key     = $this->get_gravity_form_interaction_key($form_id);

		if (! isset($catalog[$key])) {
			$key = 'disabled';
		}

		return array_merge(
			array(
				'key' => $key,
			),
			$catalog[$key]
		);
	}

	private function get_active_gravity_form_ids() {
		$forms = $this->get_gravity_forms_for_settings();
		$ids   = array();

		foreach ($forms as $form) {
			$interaction = $this->get_gravity_form_interaction_config($form['id']);
			if ('disabled' !== $interaction['key']) {
				$ids[] = (int) $form['id'];
			}
		}

		return $ids;
	}

	private function gravity_form_is_enabled($form_id) {
		return in_array(absint($form_id), $this->get_enabled_gravity_form_ids(), true);
	}

	private function gravity_form_is_donation($form_id) {
		return in_array(absint($form_id), $this->get_donation_gravity_form_ids(), true);
	}

	private function get_gravity_forms_for_settings() {
		if (! class_exists('GFAPI')) {
			return array();
		}

		$forms = GFAPI::get_forms();

		return array_map(
			function ($form) {
				return array(
					'id'    => (int) $form['id'],
					'title' => $form['title'] ? $form['title'] : 'Untitled form',
				);
			},
			(array) $forms
		);
	}

	private function get_gravity_form_definition($form_id) {
		$form_id = absint($form_id);
		if (! $form_id || ! class_exists('GFAPI')) {
			return null;
		}

		if (array_key_exists($form_id, $this->gravity_form_definitions)) {
			return $this->gravity_form_definitions[ $form_id ];
		}

		$form = GFAPI::get_form($form_id);
		$this->gravity_form_definitions[ $form_id ] = is_array($form) ? $form : null;

		return $this->gravity_form_definitions[ $form_id ];
	}

	private function gravity_form_field_property($field, $property, $default = null) {
		if (is_array($field) && array_key_exists($property, $field)) {
			return $field[ $property ];
		}

		if (is_object($field) && isset($field->{$property})) {
			return $field->{$property};
		}

		return $default;
	}

	private function gravity_form_field_type($field) {
		if (is_object($field) && method_exists($field, 'get_input_type')) {
			$type = $field->get_input_type();
			if (is_string($type) && '' !== $type) {
				return strtolower($type);
			}
		}

		return strtolower((string) $this->gravity_form_field_property($field, 'type', ''));
	}

	private function gravity_form_entry_value($meta, $key) {
		$key = strtolower((string) $key);
		if ('' === $key) {
			return '';
		}

		return isset($meta[ $key ]) && is_string($meta[ $key ]) ? $meta[ $key ] : '';
	}

	private function join_non_empty_values($values, $separator = ' ') {
		$parts = array();
		foreach ((array) $values as $value) {
			$value = trim((string) $value);
			if ('' !== $value) {
				$parts[] = $value;
			}
		}

		return implode($separator, $parts);
	}

	private function gravity_form_field_label($field) {
		$admin_label = trim((string) $this->gravity_form_field_property($field, 'adminLabel', ''));
		if ('' !== $admin_label) {
			return $admin_label;
		}

		return trim((string) $this->gravity_form_field_property($field, 'label', ''));
	}

	private function gravity_form_name_value($field, $meta) {
		$inputs = $this->gravity_form_field_property($field, 'inputs', array());
		if (! empty($inputs)) {
			$parts = array();
			foreach ((array) $inputs as $input) {
				$input_id = $this->gravity_form_field_property($input, 'id', '');
				$value    = $this->gravity_form_entry_value($meta, $input_id);
				if ('' !== trim($value)) {
					$parts[] = $value;
				}
			}

			return $this->join_non_empty_values($parts, ' ');
		}

		return trim($this->gravity_form_entry_value($meta, $this->gravity_form_field_property($field, 'id', '')));
	}

	private function gravity_form_address_value($field, $meta) {
		$inputs = $this->gravity_form_field_property($field, 'inputs', array());
		if (! empty($inputs)) {
			$parts = array();
			foreach ((array) $inputs as $input) {
				$input_id = $this->gravity_form_field_property($input, 'id', '');
				$value    = $this->gravity_form_entry_value($meta, $input_id);
				if ('' !== trim($value)) {
					$parts[] = $value;
				}
			}

			return $this->join_non_empty_values($parts, ', ');
		}

		return trim($this->gravity_form_entry_value($meta, $this->gravity_form_field_property($field, 'id', '')));
	}

	private function gravity_form_profile_from_meta($form_id, $meta) {
		$profile = array(
			'email'    => isset($meta['email']) ? trim((string) $meta['email']) : '',
			'fullName' => $this->join_non_empty_values(
				array(
					isset($meta['first_name']) ? $meta['first_name'] : '',
					isset($meta['last_name']) ? $meta['last_name'] : '',
				)
			),
			'phone'    => isset($meta['phone']) ? trim((string) $meta['phone']) : '',
			'address'  => isset($meta['address']) ? trim((string) $meta['address']) : '',
		);
		$form    = $this->get_gravity_form_definition($form_id);

		if (! is_array($form) || empty($form['fields'])) {
			return $profile;
		}

		foreach ((array) $form['fields'] as $field) {
			$type     = $this->gravity_form_field_type($field);
			$field_id = $this->gravity_form_field_property($field, 'id', '');

			if ('email' === $type && '' === $profile['email']) {
				$profile['email'] = trim($this->gravity_form_entry_value($meta, $field_id));
				continue;
			}

			if ('name' === $type && '' === $profile['fullName']) {
				$profile['fullName'] = trim($this->gravity_form_name_value($field, $meta));
				continue;
			}

			if ('phone' === $type && '' === $profile['phone']) {
				$profile['phone'] = trim($this->gravity_form_entry_value($meta, $field_id));
				continue;
			}

			if ('address' === $type && '' === $profile['address']) {
				$profile['address'] = trim($this->gravity_form_address_value($field, $meta));
			}
		}

		return $profile;
	}

	private function parse_amount_to_cents($value) {
		if (null === $value) {
			return null;
		}

		$raw = trim((string) $value);
		if ('' === $raw) {
			return null;
		}

		$normalized = preg_replace('/[^0-9.\-]/', '', $raw);
		if (! is_string($normalized) || '' === $normalized || ! is_numeric($normalized)) {
			return null;
		}

		return (int) round(((float) $normalized) * 100);
	}

	private function gravity_form_amount_from_fields($form_id, $meta) {
		$form = $this->get_gravity_form_definition($form_id);
		if (! is_array($form) || empty($form['fields'])) {
			return null;
		}

		$fallback_cents = null;

		foreach ((array) $form['fields'] as $field) {
			$type      = $this->gravity_form_field_type($field);
			$field_id  = $this->gravity_form_field_property($field, 'id', '');
			$field_key = strtolower((string) $field_id);
			$value     = $this->gravity_form_entry_value($meta, $field_key);
			$label     = strtolower($this->gravity_form_field_label($field));

			if ('total' === $type) {
				$cents = $this->parse_amount_to_cents($value);
				if (null !== $cents) {
					return $cents;
				}
			}

			if ('' !== $value && in_array($type, array('number', 'hidden', 'product', 'price', 'singleproduct'), true)) {
				if (false !== strpos($label, 'donation') || false !== strpos($label, 'amount') || false !== strpos($label, 'total')) {
					$cents = $this->parse_amount_to_cents($value);
					if (null !== $cents) {
						$fallback_cents = $cents;
					}
				}
			}
		}

		return $fallback_cents;
	}

	private function gravity_form_amount_cents($form_id, $row, $meta) {
		$payment_amount = isset($row['payment_amount']) ? $this->parse_amount_to_cents($row['payment_amount']) : null;
		if (null !== $payment_amount) {
			return $payment_amount;
		}

		$field_amount = $this->gravity_form_amount_from_fields($form_id, $meta);
		if (null !== $field_amount) {
			return $field_amount;
		}

		foreach (array('payment_amount', 'donation_amount', 'amount', 'total', 'total_amount') as $key) {
			$cents = $this->parse_amount_to_cents(isset($meta[ $key ]) ? $meta[ $key ] : null);
			if (null !== $cents) {
				return $cents;
			}
		}

		return null;
	}

	private function gravity_forms_currency($row) {
		$entry_currency = isset($row['currency']) ? trim((string) $row['currency']) : '';
		if ('' !== $entry_currency) {
			return strtoupper($entry_currency);
		}

		$option_currency = get_option('rg_gforms_currency', 'USD');
		$option_currency = is_string($option_currency) ? trim($option_currency) : 'USD';

		return '' !== $option_currency ? strtoupper($option_currency) : 'USD';
	}

	private function normalize_source($source) {
		return strtolower(str_replace('-', '_', (string) $source));
	}

	private function empty_feed($source, $mode, $page) {
		return array(
			'source'     => $source,
			'items'      => array(),
			'mode'       => $mode,
			'nextCursor' => null,
			'page'       => $page,
			'hasMore'    => false,
			'estimatedTotal' => 0,
		);
	}

	private function combine_feed_parts($source, $mode, $page, $feeds) {
		$items           = array();
		$cursors         = array();
		$has_more        = false;
		$estimated_total = 0;
		$has_known_total = true;

		foreach ((array) $feeds as $feed) {
			if (! is_array($feed)) {
				continue;
			}

			$items    = array_merge($items, isset($feed['items']) ? (array) $feed['items'] : array());
			$has_more = $has_more || ! empty($feed['hasMore']);

			if (! empty($feed['nextCursor'])) {
				$cursors[] = $feed['nextCursor'];
			}

			if (array_key_exists('estimatedTotal', $feed) && is_numeric($feed['estimatedTotal'])) {
				$estimated_total += (int) $feed['estimatedTotal'];
			} else {
				$has_known_total = false;
			}
		}

		usort($items, array($this, 'compare_feed_events'));

		return array(
			'source'     => $source,
			'items'      => array_values($items),
			'mode'       => $mode,
			'nextCursor' => $this->max_cursor($cursors),
			'page'       => $page,
			'hasMore'    => $has_more,
			'estimatedTotal' => $has_known_total ? $estimated_total : null,
		);
	}

	private function compare_feed_events($left, $right) {
		$left_time  = isset($left['occurredAt']) ? strtotime((string) $left['occurredAt']) : 0;
		$right_time = isset($right['occurredAt']) ? strtotime((string) $right['occurredAt']) : 0;

		if ($left_time === $right_time) {
			return strcmp((string) $right['externalId'], (string) $left['externalId']);
		}

		return $right_time <=> $left_time;
	}

	private function max_cursor($cursors) {
		$max_cursor = null;
		$max_time   = null;

		foreach ((array) $cursors as $cursor) {
			if (! $cursor) {
				continue;
			}

			$timestamp = strtotime((string) $cursor);
			if (false === $timestamp) {
				continue;
			}

			if (null === $max_time || $timestamp > $max_time) {
				$max_time   = $timestamp;
				$max_cursor = gmdate('c', $timestamp);
			}
		}

		return $max_cursor;
	}

	private function iso_from_mysql($value, DateTimeZone $timezone) {
		$value = is_string($value) ? trim($value) : '';
		if ('' === $value || '0000-00-00 00:00:00' === $value) {
			return null;
		}

		try {
			$date = new DateTimeImmutable($value, $timezone);
			return $date->setTimezone(new DateTimeZone('UTC'))->format('c');
		} catch (Exception $exception) {
			return null;
		}
	}

	private function iso_from_gmt_mysql($value) {
		return $this->iso_from_mysql($value, new DateTimeZone('UTC'));
	}

	private function iso_from_local_mysql($value) {
		return $this->iso_from_mysql($value, wp_timezone());
	}

	private function iso_from_any_datetime($value, $assume_gmt = false) {
		$value = is_string($value) ? trim($value) : '';
		if ('' === $value) {
			return null;
		}

		if (preg_match('/^\d{4}-\d{2}-\d{2} /', $value)) {
			return $assume_gmt ? $this->iso_from_gmt_mysql($value) : $this->iso_from_local_mysql($value);
		}

		$timestamp = strtotime($value);
		return false === $timestamp ? null : gmdate('c', $timestamp);
	}

	private function gmt_mysql_from_cursor($cursor) {
		$timestamp = strtotime((string) $cursor);
		return false === $timestamp ? '' : gmdate('Y-m-d H:i:s', $timestamp);
	}

	private function local_mysql_from_cursor($cursor) {
		$timestamp = strtotime((string) $cursor);
		return false === $timestamp ? '' : wp_date('Y-m-d H:i:s', $timestamp, wp_timezone());
	}

	private function display_datetime($iso_string) {
		if (! $iso_string) {
			return null;
		}

		$timestamp = strtotime((string) $iso_string);
		if (false === $timestamp) {
			return null;
		}

		return wp_date(get_option('date_format') . ' ' . get_option('time_format'), $timestamp, wp_timezone());
	}

	private function format_duration_minutes($duration_minutes) {
		$minutes = (int) $duration_minutes;
		if ($minutes <= 0) {
			return null;
		}

		if ($minutes < 60) {
			return sprintf('%dm', $minutes);
		}

		$hours             = (int) floor($minutes / 60);
		$remaining_minutes = $minutes % 60;

		if ($remaining_minutes <= 0) {
			return sprintf('%dh', $hours);
		}

		return sprintf('%dh %dm', $hours, $remaining_minutes);
	}

	private function implode_summary($parts) {
		$parts = array_values(array_filter(array_map('trim', (array) $parts)));
		return $parts ? implode(' | ', $parts) : null;
	}

	private function resolve_wordpress_profile_photo_url($user_id) {
		$user_id = absint($user_id);
		if (! $user_id) {
			return null;
		}

		$avatar = get_avatar_data(
			$user_id,
			array(
				'size'          => 192,
				'default'       => '404',
				'force_default' => false,
			)
		);

		if (empty($avatar['url']) || ! is_string($avatar['url'])) {
			return null;
		}

		$avatar_url = trim($avatar['url']);
		if (! $avatar_url || ! filter_var($avatar_url, FILTER_VALIDATE_URL)) {
			return null;
		}

		$avatar_host                = wp_parse_url($avatar_url, PHP_URL_HOST);
		$is_gravatar_host           = is_string($avatar_host) && preg_match('/(^|\.)gravatar\.com$/i', $avatar_host);
		$is_wordpress_avatar_host   = is_string($avatar_host) && preg_match('/(^|\.)avatar-management\.wordpress\.com$/i', $avatar_host);
		$found_avatar               = ! empty($avatar['found_avatar']);

		if ($found_avatar || (! $is_gravatar_host && ! $is_wordpress_avatar_host)) {
			return esc_url_raw($avatar_url);
		}

		return null;
	}

	private function resolve_acf_profile_photo_url($user_id) {
		$user_id = absint($user_id);
		if (! $user_id) {
			return null;
		}

		$photo = null;
		if (function_exists('get_field')) {
			$photo = get_field('photo', 'user_' . $user_id);
		}

		if (! $photo) {
			$photo = get_user_meta($user_id, 'photo', true);
		}

		if (! $photo) {
			return null;
		}

		if (is_array($photo)) {
			if (! empty($photo['sizes']) && is_array($photo['sizes'])) {
				if (! empty($photo['sizes']['small-square'])) {
					return esc_url_raw($photo['sizes']['small-square']);
				}

				if (! empty($photo['sizes']['thumbnail'])) {
					return esc_url_raw($photo['sizes']['thumbnail']);
				}
			}

			if (! empty($photo['url']) && is_string($photo['url'])) {
				return esc_url_raw($photo['url']);
			}

			if (! empty($photo['ID'])) {
				$image_url = wp_get_attachment_image_url((int) $photo['ID'], 'small-square');
				if (! $image_url) {
					$image_url = wp_get_attachment_image_url((int) $photo['ID'], 'thumbnail');
				}

				return $image_url ? esc_url_raw($image_url) : null;
			}
		}

		if (is_numeric($photo)) {
			$image_url = wp_get_attachment_image_url((int) $photo, 'small-square');
			if (! $image_url) {
				$image_url = wp_get_attachment_image_url((int) $photo, 'thumbnail');
			}

			return $image_url ? esc_url_raw($image_url) : null;
		}

		if (is_string($photo) && filter_var($photo, FILTER_VALIDATE_URL)) {
			return esc_url_raw($photo);
		}

		return null;
	}

	private function resolve_profile_photo_url($user_id) {
		$user_id = absint($user_id);
		if (! $user_id) {
			return null;
		}

		$avatar_url = $this->resolve_wordpress_profile_photo_url($user_id);
		if ($avatar_url) {
			return $avatar_url;
		}

		return $this->resolve_acf_profile_photo_url($user_id);
	}

	private function normalize_certification_ids($values) {
		if (! is_array($values)) {
			$values = empty($values) ? array() : array($values);
		}

		$ids = array();
		foreach ($values as $value) {
			$certification_id = 0;

			if ($value instanceof WP_Post) {
				$certification_id = (int) $value->ID;
			} elseif (is_array($value)) {
				if (! empty($value['ID'])) {
					$certification_id = (int) $value['ID'];
				} elseif (! empty($value['id'])) {
					$certification_id = (int) $value['id'];
				}
			} else {
				$certification_id = (int) $value;
			}

			if ($certification_id > 0) {
				$ids[ $certification_id ] = $certification_id;
			}
		}

		return array_values($ids);
	}

	private function get_user_certification_ids($user_id) {
		$user_id = absint($user_id);
		if (! $user_id) {
			return array();
		}

		if (function_exists('get_field')) {
			$certifications = get_field('certs', 'user_' . $user_id);
			$ids            = $this->normalize_certification_ids($certifications);
			if (! empty($ids)) {
				return $ids;
			}

			$legacy_ids = $this->normalize_certification_ids(get_field('certifications', 'user_' . $user_id));
			if (! empty($legacy_ids)) {
				return $legacy_ids;
			}
		}

		$meta_ids = $this->normalize_certification_ids(get_user_meta($user_id, 'certifications', true));
		if (! empty($meta_ids)) {
			return $meta_ids;
		}

		return $this->normalize_certification_ids(get_user_meta($user_id, 'certs', true));
	}

	private function resolve_certification_image_url($certification_id) {
		$image = null;
		if (function_exists('get_field')) {
			$image = get_field('badge_image', $certification_id);
		}

		if (! $image) {
			return null;
		}

		if (is_array($image)) {
			if (! empty($image['sizes']) && is_array($image['sizes'])) {
				if (! empty($image['sizes']['small-square'])) {
					return esc_url_raw($image['sizes']['small-square']);
				}

				if (! empty($image['sizes']['thumbnail'])) {
					return esc_url_raw($image['sizes']['thumbnail']);
				}
			}

			if (! empty($image['url']) && is_string($image['url'])) {
				return esc_url_raw($image['url']);
			}

			if (! empty($image['ID'])) {
				$image_url = wp_get_attachment_image_url((int) $image['ID'], 'small-square');
				if (! $image_url) {
					$image_url = wp_get_attachment_image_url((int) $image['ID'], 'thumbnail');
				}

				return $image_url ? esc_url_raw($image_url) : null;
			}
		}

		if (is_numeric($image)) {
			$image_url = wp_get_attachment_image_url((int) $image, 'small-square');
			if (! $image_url) {
				$image_url = wp_get_attachment_image_url((int) $image, 'thumbnail');
			}

			return $image_url ? esc_url_raw($image_url) : null;
		}

		if (is_string($image) && filter_var($image, FILTER_VALIDATE_URL)) {
			return esc_url_raw($image);
		}

		return null;
	}

	private function certification_time_to_timestamp($value) {
		if (empty($value)) {
			return 0;
		}

		if (is_numeric($value)) {
			$timestamp = (int) $value;
			return $timestamp > 0 ? $timestamp : 0;
		}

		$timestamp = strtotime((string) $value);
		return false === $timestamp ? 0 : $timestamp;
	}

	private function build_certification_status($certification_id, $last_time) {
		$expiration_days = function_exists('get_field') ? (int) get_field('expiration_time', $certification_id) : 0;
		$last_used_ts    = $this->certification_time_to_timestamp($last_time);
		$last_used_at    = $last_used_ts ? gmdate('c', $last_used_ts) : null;
		$last_used_label = $last_used_ts
			? 'Last use: ' . date_i18n('M j, Y', $last_used_ts)
			: (! empty($last_time) ? 'Last use: ' . (string) $last_time : 'No last use/renewal recorded');

		if ($expiration_days <= 0) {
			return array(
				'statusKey'     => 'no_expiration',
				'statusLabel'   => 'No Expiration',
				'lastUsedAt'    => $last_used_at,
				'lastUsedLabel' => $last_used_label,
				'expiresAt'     => null,
				'expiresLabel'  => 'No expiration',
				'detail'        => $last_used_label,
			);
		}

		if (! $last_used_ts) {
			return array(
				'statusKey'     => 'unknown',
				'statusLabel'   => 'Unknown',
				'lastUsedAt'    => $last_used_at,
				'lastUsedLabel' => $last_used_label,
				'expiresAt'     => null,
				'expiresLabel'  => null,
				'detail'        => empty($last_time) ? 'No last use/renewal recorded' : 'Unrecognized last use/renewal format',
			);
		}

		$now_timestamp = current_time('timestamp');
		$expires_ts    = $last_used_ts + ($expiration_days * DAY_IN_SECONDS);
		$expires_at    = gmdate('c', $expires_ts);
		$expires_label = date_i18n('M j, Y', $expires_ts);

		if ($expires_ts < $now_timestamp) {
			$days_ago = (int) floor(($now_timestamp - $expires_ts) / DAY_IN_SECONDS);
			return array(
				'statusKey'     => 'expired',
				'statusLabel'   => 'Expired',
				'lastUsedAt'    => $last_used_at,
				'lastUsedLabel' => $last_used_label,
				'expiresAt'     => $expires_at,
				'expiresLabel'  => $expires_label,
				'detail'        => 'Expired ' . $days_ago . ' day' . (1 === $days_ago ? '' : 's') . ' ago',
			);
		}

		$days_left  = (int) ceil(($expires_ts - $now_timestamp) / DAY_IN_SECONDS);
		$status_key = $days_left <= 30 ? 'expiring' : 'active';

		return array(
			'statusKey'     => $status_key,
			'statusLabel'   => 'expiring' === $status_key ? 'Expiring Soon' : 'Active',
			'lastUsedAt'    => $last_used_at,
			'lastUsedLabel' => $last_used_label,
			'expiresAt'     => $expires_at,
			'expiresLabel'  => $expires_label,
			'detail'        => $days_left . ' day' . (1 === $days_left ? '' : 's') . ' remaining',
		);
	}

	private function build_user_certifications($user_id) {
		$user_id            = absint($user_id);
		$certification_ids  = $this->get_user_certification_ids($user_id);
		$certifications     = array();

		foreach ($certification_ids as $certification_id) {
			$certification_post = get_post($certification_id);
			if (! $certification_post || 'certs' !== $certification_post->post_type) {
				continue;
			}

			$last_time = get_user_meta($user_id, $certification_id . '_last_time', true);
			$status    = $this->build_certification_status($certification_id, $last_time);

			$certifications[] = array(
				'id'            => (string) $certification_id,
				'name'          => get_the_title($certification_id) ? get_the_title($certification_id) : ('Badge #' . $certification_id),
				'statusKey'     => $status['statusKey'],
				'statusLabel'   => $status['statusLabel'],
				'lastUsedAt'    => $status['lastUsedAt'],
				'lastUsedLabel' => $status['lastUsedLabel'],
				'expiresAt'     => $status['expiresAt'],
				'expiresLabel'  => $status['expiresLabel'],
				'detail'        => $status['detail'],
				'imageUrl'      => $this->resolve_certification_image_url($certification_id),
			);
		}

		return $certifications;
	}

	private function build_user_profile($user, $include_certifications = false) {
		if (! $user instanceof WP_User) {
			return array(
				'fullName'       => null,
				'phone'          => null,
				'address'        => null,
				'photoUrl'       => null,
				'certifications' => $include_certifications ? array() : null,
			);
		}

		$full_name = trim($user->first_name . ' ' . $user->last_name);
		if (! $full_name) {
			$full_name = $user->display_name;
		}

		$address = trim(
			implode(
				' ',
				array_filter(
					array(
						get_user_meta($user->ID, 'billing_address_1', true),
						get_user_meta($user->ID, 'billing_city', true),
						get_user_meta($user->ID, 'billing_state', true),
						get_user_meta($user->ID, 'billing_postcode', true),
					)
				)
			)
		);

		return array(
			'fullName'       => $full_name ? $full_name : null,
			'phone'          => get_user_meta($user->ID, 'billing_phone', true) ? get_user_meta($user->ID, 'billing_phone', true) : null,
			'address'        => $address ? $address : null,
			'photoUrl'       => $this->resolve_profile_photo_url($user->ID),
			'certifications' => $include_certifications ? $this->build_user_certifications($user->ID) : null,
		);
	}

	private function build_order_profile($order) {
		$full_name = trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name());
		$customer_id = (int) $order->get_customer_id();
		$address   = trim(
			implode(
				' ',
				array_filter(
					array(
						$order->get_billing_address_1(),
						$order->get_billing_city(),
						$order->get_billing_state(),
						$order->get_billing_postcode(),
					)
				)
			)
		);

		return array(
			'fullName' => $full_name ? $full_name : null,
			'phone'    => $order->get_billing_phone() ? $order->get_billing_phone() : null,
			'address'  => $address ? $address : null,
			'photoUrl' => $customer_id ? $this->resolve_profile_photo_url($customer_id) : null,
		);
	}

	private function build_order_identities($order, $extra = array()) {
		$identities = array(
			array(
				'type' => 'order',
				'id'   => (string) $order->get_id(),
			),
		);

		if ($order->get_customer_id()) {
			$identities[] = array(
				'type' => 'customer',
				'id'   => (string) $order->get_customer_id(),
			);
		}

		return array_values(array_merge($identities, (array) $extra));
	}

	private function build_user_identities($user_id, $extra = array()) {
		$identities = array();
		if ($user_id) {
			$identities[] = array(
				'type' => 'wordpress_user',
				'id'   => (string) absint($user_id),
			);
		}

		return array_values(array_merge($identities, (array) $extra));
	}

	private function get_occurrence_window($product_id, $occurrence_id) {
		$start_raw = $product_id ? get_post_meta($product_id, 'linkedEventStartDate', true) : '';
		$end_raw   = $product_id ? get_post_meta($product_id, 'linkedEventEndDate', true) : '';

		if (! $start_raw) {
			$start_raw = get_post_meta($occurrence_id, 'event_start_time_stamp', true);
		}

		if (! $end_raw) {
			$end_raw = get_post_meta($occurrence_id, 'event_end_time_stamp', true);
		}

		$start_iso = $this->iso_from_local_mysql($start_raw);
		$end_iso   = $this->iso_from_local_mysql($end_raw);

		return array(
			'start'      => $start_iso,
			'end'        => $end_iso,
			'startLabel' => $this->display_datetime($start_iso),
			'endLabel'   => $this->display_datetime($end_iso),
		);
	}

	private function get_product_term_slugs($product_id) {
		$category_slugs = wp_get_post_terms($product_id, 'product_cat', array('fields' => 'slugs'));
		$tag_slugs      = wp_get_post_terms($product_id, 'product_tag', array('fields' => 'slugs'));

		if (is_wp_error($category_slugs)) {
			$category_slugs = array();
		}

		if (is_wp_error($tag_slugs)) {
			$tag_slugs = array();
		}

		return array_values(array_unique(array_merge((array) $category_slugs, (array) $tag_slugs)));
	}

	private function build_product_mapping_hints($product_id, $product = null) {
		$hints = array();
		$product_id = absint($product_id);

		if ($product_id > 0) {
			$hints[] = array(
				'type'  => 'product_id',
				'value' => (string) $product_id,
			);
		}

		if (! $product && $product_id && function_exists('wc_get_product')) {
			$product = wc_get_product($product_id);
		}

		if ($product_id <= 0) {
			return $hints;
		}

		if ($product && is_object($product) && method_exists($product, 'get_sku')) {
			$sku = trim((string) $product->get_sku());
			if ('' !== $sku) {
				$hints[] = array(
					'type'  => 'sku',
					'value' => $sku,
				);
			}
		}

		$category_slugs = wp_get_post_terms($product_id, 'product_cat', array('fields' => 'slugs'));
		$tag_slugs      = wp_get_post_terms($product_id, 'product_tag', array('fields' => 'slugs'));

		if (is_wp_error($category_slugs)) {
			$category_slugs = array();
		}

		if (is_wp_error($tag_slugs)) {
			$tag_slugs = array();
		}

		foreach ((array) $category_slugs as $slug) {
			$slug = sanitize_title($slug);
			if ('' === $slug) {
				continue;
			}

			$hints[] = array(
				'type'  => 'category_slug',
				'value' => $slug,
			);
		}

		foreach ((array) $tag_slugs as $slug) {
			$slug = sanitize_title($slug);
			if ('' === $slug) {
				continue;
			}

			$hints[] = array(
				'type'  => 'product_tag',
				'value' => $slug,
			);
			$hints[] = array(
				'type'  => 'tag',
				'value' => $slug,
			);
		}

		return array_values(array_unique($hints, SORT_REGULAR));
	}

	private function is_donation_product($product_id, $product = null, $item = null, $order = null) {
		$slugs = $this->get_product_term_slugs($product_id);
		foreach ($slugs as $slug) {
			if (false !== strpos((string) $slug, 'donation')) {
				return (bool) apply_filters('msf_crm_bridge_is_donation_product', true, $product_id, $product, $item, $order);
			}
		}

		$name = $product && is_object($product) && method_exists($product, 'get_name') ? strtolower((string) $product->get_name()) : strtolower((string) get_the_title($product_id));
		$is_donation = false !== strpos($name, 'donation');

		return (bool) apply_filters('msf_crm_bridge_is_donation_product', $is_donation, $product_id, $product, $item, $order);
	}

	private function get_membership_product_ids() {
		if (null !== $this->membership_product_ids) {
			return $this->membership_product_ids;
		}

		$product_ids = array();

		if (function_exists('wc_memberships_get_membership_plans')) {
			$plans = wc_memberships_get_membership_plans();

			foreach ((array) $plans as $plan) {
				if (! is_object($plan)) {
					continue;
				}

				if (method_exists($plan, 'get_product_ids')) {
					$product_ids = array_merge($product_ids, array_map('absint', (array) $plan->get_product_ids()));
					continue;
				}

				if (method_exists($plan, 'get_access_product_ids')) {
					$product_ids = array_merge($product_ids, array_map('absint', (array) $plan->get_access_product_ids()));
					continue;
				}
			}
		}

		$this->membership_product_ids = array_values(array_unique(array_filter($product_ids)));
		return $this->membership_product_ids;
	}

	private function is_membership_product($product_id, $product = null) {
		$product_ids    = $this->get_membership_product_ids();
		$is_membership  = in_array(absint($product_id), $product_ids, true);

		if (! $is_membership) {
			foreach ($this->get_product_term_slugs($product_id) as $slug) {
				if (false !== strpos((string) $slug, 'membership')) {
					$is_membership = true;
					break;
				}
			}
		}

		if (! $is_membership) {
			$name = $product && is_object($product) && method_exists($product, 'get_name') ? strtolower((string) $product->get_name()) : strtolower((string) get_the_title($product_id));
			$is_membership = false !== strpos($name, 'membership');
		}

		return (bool) apply_filters('msf_crm_bridge_is_membership_product', $is_membership, $product_id, $product, $product_ids);
	}

	private function get_woocommerce_feed($mode, $cursor, $page, $limit) {
		$parts = array(
			$this->get_woocommerce_order_events($mode, $cursor, $page, $limit),
			$this->get_woocommerce_membership_events($mode, $cursor, $page, $limit),
			$this->get_class_attendance_feed($mode, $cursor, $page, $limit),
		);

		return $this->combine_feed_parts('WOOCOMMERCE', $mode, $page, $parts);
	}

	private function get_woocommerce_order_events($mode, $cursor, $page, $limit) {
		if (! function_exists('wc_get_orders')) {
			return array(
				'items'      => array(),
				'nextCursor' => null,
				'hasMore'    => false,
			);
		}

		$args = array(
			'limit'    => $limit,
			'page'     => $page,
			'paginate' => true,
			'orderby'  => 'date',
			'order'    => 'DESC',
			'status'   => array('completed'),
			'type'     => 'shop_order',
		);

		if ('INCREMENTAL' === $mode && $cursor) {
			$args['date_modified'] = '>' . $this->gmt_mysql_from_cursor($cursor);
		}

		$results      = wc_get_orders($args);
		$order_list   = is_array($results) && isset($results['orders']) ? $results['orders'] : (is_object($results) && isset($results->orders) ? $results->orders : array());
		$total_pages  = is_array($results) && isset($results['max_num_pages']) ? (int) $results['max_num_pages'] : (is_object($results) && isset($results->max_num_pages) ? (int) $results->max_num_pages : 1);
		$items        = array();
		$cursor_parts = array();

		foreach ($order_list as $order) {
			if (! is_object($order)) {
				continue;
			}

			$modified = method_exists($order, 'get_date_modified') ? $order->get_date_modified() : null;
			if ($modified instanceof WC_DateTime) {
				$cursor_parts[] = gmdate('c', $modified->getTimestamp());
			}

			$items = array_merge($items, $this->map_woocommerce_order_events($order));
		}

		return array(
			'items'      => $items,
			'nextCursor' => $this->max_cursor($cursor_parts),
			'hasMore'    => $page < $total_pages,
		);
	}

	private function map_woocommerce_order_events($order) {
		$events = array();

		foreach ($order->get_items('line_item') as $item) {
			$product_id = method_exists($item, 'get_product_id') ? absint($item->get_product_id()) : 0;
			if (! $product_id) {
				continue;
			}

			$product          = function_exists('wc_get_product') ? wc_get_product($product_id) : null;
			$parent_event_id  = absint(get_post_meta($product_id, 'linked_event', true));
			$occurrence_id    = absint(get_post_meta($product_id, 'linked_occurance', true));
			$custom_event     = apply_filters('msf_crm_bridge_order_item_event', null, $order, $item, $product, $parent_event_id, $occurrence_id);

			if (is_array($custom_event) && ! empty($custom_event['externalId'])) {
				$events[] = $custom_event;
				continue;
			}

			if ($parent_event_id && $occurrence_id) {
				$events[] = $this->map_class_purchase_event($order, $item, $product_id, $parent_event_id, $occurrence_id);
				continue;
			}

			if ($this->is_membership_product($product_id, $product)) {
				continue;
			}

			if ($this->is_donation_product($product_id, $product, $item, $order)) {
				$events[] = $this->map_donation_event($order, $item, $product_id);
				continue;
			}

			$events[] = $this->map_general_purchase_event($order, $item, $product_id);
		}

		return array_values(array_filter($events));
	}

	private function map_donation_event($order, $item, $product_id) {
		$amount_cents = (int) round(((float) $item->get_total()) * 100);
		$title        = trim((string) $item->get_name()) ? 'Donation: ' . trim((string) $item->get_name()) : 'Donation';
		$product      = $product_id && function_exists('wc_get_product') ? wc_get_product($product_id) : null;

		return array(
			'externalId'  => 'wc-donation-' . $order->get_id() . '-' . $item->get_id(),
			'occurredAt'  => $order->get_date_created() ? gmdate('c', $order->get_date_created()->getTimestamp()) : gmdate('c'),
			'email'       => $order->get_billing_email(),
			'title'       => $title,
			'summary'     => $this->implode_summary(
				array(
					'Order #' . $order->get_order_number(),
					wc_get_order_status_name($order->get_status()),
				)
			),
			'amountCents' => $amount_cents,
			'currency'    => $order->get_currency(),
			'eventKind'   => 'donation',
			'laneKey'     => 'DONOR',
			'roleKey'     => 'donor',
			'profile'     => $this->build_order_profile($order),
			'identities'  => $this->build_order_identities(
				$order,
				array(
					array('type' => 'product', 'id' => (string) $product_id),
					array('type' => 'order_item', 'id' => (string) $item->get_id()),
				)
			),
			'mappingHints' => $this->build_product_mapping_hints($product_id, $product),
			'metadata'    => array(
				'orderId'       => $order->get_id(),
				'orderStatus'   => $order->get_status(),
				'orderItemId'   => $item->get_id(),
				'productId'     => $product_id,
				'productName'   => $item->get_name(),
				'quantity'      => method_exists($item, 'get_quantity') ? (int) $item->get_quantity() : 1,
			),
			'rawPayload'   => array(
				'orderId'     => $order->get_id(),
				'orderNumber' => $order->get_order_number(),
				'status'      => $order->get_status(),
				'itemId'      => $item->get_id(),
				'productId'   => $product_id,
				'itemName'    => $item->get_name(),
				'quantity'    => method_exists($item, 'get_quantity') ? (int) $item->get_quantity() : 1,
				'amountCents' => $amount_cents,
			),
		);
	}

	private function map_general_purchase_event($order, $item, $product_id) {
		$amount_cents = (int) round(((float) $item->get_total()) * 100);
		$title        = trim((string) $item->get_name()) ? 'Purchase: ' . trim((string) $item->get_name()) : 'Purchase';
		$product      = $product_id && function_exists('wc_get_product') ? wc_get_product($product_id) : null;

		return array(
			'externalId'  => 'wc-purchase-' . $order->get_id() . '-' . $item->get_id(),
			'occurredAt'  => $order->get_date_created() ? gmdate('c', $order->get_date_created()->getTimestamp()) : gmdate('c'),
			'email'       => $order->get_billing_email(),
			'title'       => $title,
			'summary'     => $this->implode_summary(
				array(
					'Order #' . $order->get_order_number(),
					wc_get_order_status_name($order->get_status()),
				)
			),
			'amountCents' => $amount_cents,
			'currency'    => $order->get_currency(),
			'eventKind'   => 'purchase',
			'laneKey'     => 'PURCHASE',
			'roleKey'     => null,
			'profile'     => $this->build_order_profile($order),
			'identities'  => $this->build_order_identities(
				$order,
				array(
					array('type' => 'product', 'id' => (string) $product_id),
					array('type' => 'order_item', 'id' => (string) $item->get_id()),
				)
			),
			'mappingHints' => $this->build_product_mapping_hints($product_id, $product),
			'metadata'    => array(
				'orderId'       => $order->get_id(),
				'orderStatus'   => $order->get_status(),
				'orderItemId'   => $item->get_id(),
				'productId'     => $product_id,
				'productName'   => $item->get_name(),
				'quantity'      => method_exists($item, 'get_quantity') ? (int) $item->get_quantity() : 1,
			),
			'rawPayload'   => array(
				'orderId'     => $order->get_id(),
				'orderNumber' => $order->get_order_number(),
				'status'      => $order->get_status(),
				'itemId'      => $item->get_id(),
				'productId'   => $product_id,
				'itemName'    => $item->get_name(),
				'quantity'    => method_exists($item, 'get_quantity') ? (int) $item->get_quantity() : 1,
				'amountCents' => $amount_cents,
			),
		);
	}

	private function map_class_purchase_event($order, $item, $product_id, $parent_event_id, $occurrence_id) {
		$window       = $this->get_occurrence_window($product_id, $occurrence_id);
		$amount_cents = (int) round(((float) $item->get_total()) * 100);
		$class_title  = get_the_title($parent_event_id) ? get_the_title($parent_event_id) : $item->get_name();
		$product      = $product_id && function_exists('wc_get_product') ? wc_get_product($product_id) : null;

		return array(
			'externalId'  => 'wc-class-purchase-' . $order->get_id() . '-' . $item->get_id(),
			'occurredAt'  => $order->get_date_created() ? gmdate('c', $order->get_date_created()->getTimestamp()) : gmdate('c'),
			'email'       => $order->get_billing_email(),
			'title'       => 'Class purchase: ' . $class_title,
			'summary'     => $this->implode_summary(
				array(
					$window['startLabel'] ? 'Scheduled for ' . $window['startLabel'] : '',
					'Order #' . $order->get_order_number(),
				)
			),
			'amountCents' => $amount_cents,
			'currency'    => $order->get_currency(),
			'eventKind'   => 'class_purchase',
			'laneKey'     => 'CLASS',
			'roleKey'     => null,
			'profile'     => $this->build_order_profile($order),
			'identities'  => $this->build_order_identities(
				$order,
				array(
					array('type' => 'product', 'id' => (string) $product_id),
					array('type' => 'order_item', 'id' => (string) $item->get_id()),
					array('type' => 'event', 'id' => (string) $parent_event_id),
					array('type' => 'occurrence', 'id' => (string) $occurrence_id),
				)
			),
			'mappingHints' => $this->build_product_mapping_hints($product_id, $product),
			'metadata'    => array(
				'orderId'         => $order->get_id(),
				'orderStatus'     => $order->get_status(),
				'orderItemId'     => $item->get_id(),
				'productId'       => $product_id,
				'productName'     => $item->get_name(),
				'quantity'        => method_exists($item, 'get_quantity') ? (int) $item->get_quantity() : 1,
				'classId'         => $parent_event_id,
				'classTitle'      => $class_title,
				'occurrenceId'    => $occurrence_id,
				'occurrenceStart' => $window['start'],
				'occurrenceEnd'   => $window['end'],
			),
			'rawPayload'   => array(
				'orderId'         => $order->get_id(),
				'orderNumber'     => $order->get_order_number(),
				'status'          => $order->get_status(),
				'itemId'          => $item->get_id(),
				'productId'       => $product_id,
				'itemName'        => $item->get_name(),
				'quantity'        => method_exists($item, 'get_quantity') ? (int) $item->get_quantity() : 1,
				'amountCents'     => $amount_cents,
				'parentEventId'   => $parent_event_id,
				'parentEventName' => $class_title,
				'occurrenceId'    => $occurrence_id,
				'occurrenceStart' => $window['start'],
				'occurrenceEnd'   => $window['end'],
			),
		);
	}

	private function get_membership_event_kind($status) {
		$status = sanitize_key((string) $status);

		switch ($status) {
			case 'wcm-active':
			case 'active':
				return 'membership_active';
			case 'wcm-complimentary':
			case 'complimentary':
			case 'complimentary-access':
				return 'membership_complimentary';
			case 'wcm-cancelled':
			case 'cancelled':
				return 'membership_cancelled';
			case 'wcm-expired':
			case 'expired':
				return 'membership_expired';
			case 'wcm-paused':
			case 'paused':
				return 'membership_paused';
			case 'wcm-pending':
			case 'pending':
				return 'membership_pending';
			default:
				return 'membership_status_change';
		}
	}

	private function format_membership_status($status) {
		$status = sanitize_key((string) $status);
		$status = preg_replace('/^wcm-/', '', $status);
		$status = str_replace(array('-', '_'), ' ', $status);
		return ucfirst(trim((string) $status));
	}

	private function get_woocommerce_membership_events($mode, $cursor, $page, $limit) {
		global $wpdb;

		if (! function_exists('wc_memberships_get_user_memberships')) {
			return array(
				'items'      => array(),
				'nextCursor' => null,
				'hasMore'    => false,
			);
		}

		$where = "WHERE membership.post_type = %s";
		$args  = array('wc_user_membership');

		if ('INCREMENTAL' === $mode && $cursor) {
			$where .= ' AND COALESCE(NULLIF(membership.post_modified_gmt, %s), membership.post_date_gmt) > %s';
			$args[] = '0000-00-00 00:00:00';
			$args[] = $this->gmt_mysql_from_cursor($cursor);
		}

		$offset  = ('BACKFILL' === $mode) ? (($page - 1) * $limit) : 0;
		$sql     = "SELECT membership.ID, membership.post_parent AS plan_id, membership.post_author AS user_id, membership.post_status, membership.post_date_gmt, membership.post_modified_gmt, plans.post_title AS plan_title
			FROM {$wpdb->posts} membership
			LEFT JOIN {$wpdb->posts} plans ON plans.ID = membership.post_parent
			{$where}
			ORDER BY COALESCE(NULLIF(membership.post_modified_gmt, '0000-00-00 00:00:00'), membership.post_date_gmt) DESC
			LIMIT %d OFFSET %d";
		$args[]  = $limit;
		$args[]  = $offset;
		$rows    = $wpdb->get_results($wpdb->prepare($sql, $args), ARRAY_A);
		$items   = array();
		$cursors = array();

		foreach ((array) $rows as $row) {
			if (! empty($row['post_modified_gmt'])) {
				$cursors[] = $this->iso_from_gmt_mysql($row['post_modified_gmt']);
			} elseif (! empty($row['post_date_gmt'])) {
				$cursors[] = $this->iso_from_gmt_mysql($row['post_date_gmt']);
			}

			$mapped = $this->map_woocommerce_membership_event($row);
			if ($mapped) {
				$items[] = $mapped;
			}
		}

		return array(
			'items'      => $items,
			'nextCursor' => $this->max_cursor($cursors),
			'hasMore'    => 'BACKFILL' === $mode ? count($rows) === $limit : false,
		);
	}

	private function map_woocommerce_membership_event($row) {
		$membership = function_exists('wc_memberships_get_user_membership') ? wc_memberships_get_user_membership((int) $row['ID']) : null;
		$user_id    = $membership && method_exists($membership, 'get_user_id') ? (int) $membership->get_user_id() : (int) $row['user_id'];

		if (! $user_id) {
			$user_id = (int) get_post_meta((int) $row['ID'], '_user_id', true);
		}

		$user = $user_id ? get_userdata($user_id) : false;
		$plan_name = ! empty($row['plan_title']) ? $row['plan_title'] : 'Membership';
		$status    = ! empty($row['post_status']) ? $row['post_status'] : 'active';
		$start_raw = '';
		$end_raw   = '';

		if ($membership && method_exists($membership, 'get_start_date')) {
			$start_raw = $membership->get_start_date();
		}

		if ($membership && method_exists($membership, 'get_end_date')) {
			$end_raw = $membership->get_end_date();
		}

		if ($membership && method_exists($membership, 'get_status')) {
			$status = $membership->get_status();
		}

		if ($membership && method_exists($membership, 'get_plan')) {
			$plan = $membership->get_plan();
			if (is_object($plan)) {
				if (method_exists($plan, 'get_name')) {
					$plan_name = $plan->get_name();
				} elseif (! empty($plan->name)) {
					$plan_name = $plan->name;
				}
			}
		}

		$start_iso   = $this->iso_from_any_datetime($start_raw, true);
		$end_iso     = $this->iso_from_any_datetime($end_raw, true);
		$created_iso = $this->iso_from_gmt_mysql($row['post_date_gmt']);
		$updated_iso = $this->iso_from_gmt_mysql($row['post_modified_gmt']);
		$occurred_at = $updated_iso ? $updated_iso : ($start_iso ? $start_iso : $created_iso);
		$event_kind  = $this->get_membership_event_kind($status);
		$status_text = $this->format_membership_status($status);
		$version_key = $row['post_modified_gmt'] ? gmdate('YmdHis', strtotime($row['post_modified_gmt'] . ' UTC')) : gmdate('YmdHis', strtotime($row['post_date_gmt'] . ' UTC'));

		return array(
			'externalId' => 'wc-membership-' . (int) $row['ID'] . '-' . sanitize_key($status) . '-' . $version_key,
			'occurredAt' => $occurred_at ? $occurred_at : gmdate('c'),
			'email'      => $user instanceof WP_User ? $user->user_email : '',
			'title'      => $status_text . ' membership: ' . $plan_name,
			'summary'    => $this->implode_summary(
				array(
					$start_iso ? 'Starts ' . $this->display_datetime($start_iso) : '',
					$end_iso ? 'Ends ' . $this->display_datetime($end_iso) : '',
				)
			),
			'eventKind'  => $event_kind,
			'laneKey'    => 'MEMBER',
			'roleKey'    => 'member',
			'profile'    => $this->build_user_profile($user),
			'identities' => $this->build_user_identities(
				$user_id,
				array(
					array('type' => 'membership', 'id' => (string) $row['ID']),
					array('type' => 'membership_plan', 'id' => (string) $row['plan_id']),
				)
			),
			'metadata'   => array(
				'userId'          => $user_id,
				'membershipId'    => (int) $row['ID'],
				'membershipPlanId'=> (int) $row['plan_id'],
				'membershipPlan'  => $plan_name,
				'status'          => $status,
				'startDate'       => $start_iso,
				'endDate'         => $end_iso,
			),
			'rawPayload' => array(
				'membershipId'   => (int) $row['ID'],
				'planId'         => (int) $row['plan_id'],
				'planName'       => $plan_name,
				'userId'         => $user_id,
				'status'         => $status,
				'startDate'      => $start_iso,
				'endDate'        => $end_iso,
				'postDateGmt'    => $row['post_date_gmt'],
				'postModifiedGmt'=> $row['post_modified_gmt'],
			),
		);
	}

	private function get_class_attendance_feed($mode, $cursor, $page, $limit) {
		if (! function_exists('wc_get_order')) {
			return array(
				'items'      => array(),
				'nextCursor' => null,
				'hasMore'    => false,
			);
		}

		$query_args = array(
			'post_type'      => 'sub_event',
			'post_status'    => array('publish', 'private', 'future', 'draft'),
			'orderby'        => 'meta_value',
			'meta_key'       => 'event_start_time_stamp',
			'order'          => 'DESC',
			'fields'         => 'ids',
			'posts_per_page' => 'BACKFILL' === $mode ? $limit : -1,
			'offset'         => 'BACKFILL' === $mode ? (($page - 1) * $limit) : 0,
		);

		$occurrence_ids = get_posts($query_args);
		$items          = array();

		foreach ((array) $occurrence_ids as $occurrence_id) {
			$items = array_merge($items, $this->map_class_attendance_events_for_occurrence((int) $occurrence_id));
		}

		return array(
			'items'      => $items,
			'nextCursor' => 'INCREMENTAL' === $mode ? gmdate('c') : null,
			'hasMore'    => 'BACKFILL' === $mode ? count($occurrence_ids) === $limit : false,
		);
	}

	private function map_class_attendance_events_for_occurrence($occurrence_id) {
		$parent_event_id = wp_get_post_parent_id($occurrence_id);
		if (! $parent_event_id) {
			return array();
		}

		$attendees = get_post_meta($parent_event_id, 'attendees', true);
		if (! is_array($attendees) || ! isset($attendees[$occurrence_id]) || ! is_array($attendees[$occurrence_id])) {
			return array();
		}

		$product_id = absint(get_post_meta($occurrence_id, 'linked_product', true));
		$window     = $this->get_occurrence_window($product_id, $occurrence_id);
		$class_name = get_the_title($parent_event_id) ? get_the_title($parent_event_id) : get_the_title($occurrence_id);
		$grouped    = array();

		foreach ($attendees[$occurrence_id] as $ticket) {
			$order_id = isset($ticket['order_id']) ? absint($ticket['order_id']) : 0;
			if (! $order_id) {
				continue;
			}

			if (! isset($grouped[$order_id])) {
				$grouped[$order_id] = array(
					'ticketCount'    => 0,
					'checkedInCount' => 0,
					'userIds'        => array(),
					'tickets'        => array(),
				);
			}

			$grouped[$order_id]['ticketCount']++;
			if (! empty($ticket['checked_in'])) {
				$grouped[$order_id]['checkedInCount']++;
			}

			if (! empty($ticket['user_id'])) {
				$grouped[$order_id]['userIds'][] = (int) $ticket['user_id'];
			}

			$grouped[$order_id]['tickets'][] = $ticket;
		}

		$events      = array();
		$start_ts    = $window['start'] ? strtotime($window['start']) : false;
		$has_started = false !== $start_ts ? $start_ts <= time() : true;

		foreach ($grouped as $order_id => $group) {
			$order = wc_get_order($order_id);
			if (! $order) {
				continue;
			}

			if ($group['checkedInCount'] < 1 && ! $has_started) {
				continue;
			}

			$attendance_status = 'no_show';
			$event_kind        = 'class_no_show';
			$title_prefix      = 'Missed class';

			if ($group['checkedInCount'] > 0) {
				$attendance_status = $group['checkedInCount'] >= $group['ticketCount'] ? 'attended' : 'partial';
				$event_kind        = 'class_attended';
				$title_prefix      = 'Attended class';
			}

			$events[] = array(
				'externalId' => 'wc-class-attendance-' . $occurrence_id . '-' . $order_id,
				'occurredAt' => $window['start'] ? $window['start'] : ($order->get_date_created() ? gmdate('c', $order->get_date_created()->getTimestamp()) : gmdate('c')),
				'email'      => $order->get_billing_email(),
				'title'      => $title_prefix . ': ' . $class_name,
				'summary'    => $this->implode_summary(
					array(
						$window['startLabel'] ? $window['startLabel'] : '',
						$group['checkedInCount'] . ' of ' . $group['ticketCount'] . ' seats checked in',
						'Order #' . $order->get_order_number(),
					)
				),
				'eventKind'  => $event_kind,
				'laneKey'    => 'CLASS',
				'roleKey'    => null,
				'profile'    => $this->build_order_profile($order),
				'identities' => $this->build_order_identities(
					$order,
					array(
						array('type' => 'event', 'id' => (string) $parent_event_id),
						array('type' => 'occurrence', 'id' => (string) $occurrence_id),
						array('type' => 'product', 'id' => (string) $product_id),
					)
				),
				'metadata'   => array(
					'orderId'          => $order->get_id(),
					'orderStatus'      => $order->get_status(),
					'classId'          => $parent_event_id,
					'classTitle'       => $class_name,
					'occurrenceId'     => $occurrence_id,
					'occurrenceStart'  => $window['start'],
					'occurrenceEnd'    => $window['end'],
					'ticketCount'      => $group['ticketCount'],
					'checkedInCount'   => $group['checkedInCount'],
					'attendanceStatus' => $attendance_status,
				),
				'rawPayload' => array(
					'orderId'          => $order->get_id(),
					'parentEventId'    => $parent_event_id,
					'occurrenceId'     => $occurrence_id,
					'productId'        => $product_id,
					'occurrenceStart'  => $window['start'],
					'occurrenceEnd'    => $window['end'],
					'ticketCount'      => $group['ticketCount'],
					'checkedInCount'   => $group['checkedInCount'],
					'attendanceStatus' => $attendance_status,
					'tickets'          => $group['tickets'],
				),
			);
		}

		return $events;
	}

	private function get_woocommerce_metadata() {
		$items = array();

		if (function_exists('wc_get_products')) {
			$products = wc_get_products(
				array(
					'limit'  => 200,
					'status' => array('publish', 'private'),
				)
			);

			foreach ((array) $products as $product) {
				$categories = wp_get_post_terms($product->get_id(), 'product_cat', array('fields' => 'slugs'));
				$tags       = wp_get_post_terms($product->get_id(), 'product_tag', array('fields' => 'slugs'));

				if (is_wp_error($categories)) {
					$categories = array();
				}

				if (is_wp_error($tags)) {
					$tags = array();
				}

				$items[] = array(
					'type'       => 'product',
					'id'         => $product->get_id(),
					'name'       => $product->get_name(),
					'sku'        => $product->get_sku(),
					'categories' => array_values((array) $categories),
					'tags'       => array_values((array) $tags),
				);
			}
		}

		$plans = get_posts(
			array(
				'post_type'      => 'wc_membership_plan',
				'post_status'    => array('publish', 'private', 'draft'),
				'posts_per_page' => 200,
				'fields'         => 'ids',
			)
		);

		foreach ((array) $plans as $plan_id) {
			$items[] = array(
				'type' => 'membership_plan',
				'id'   => (int) $plan_id,
				'name' => get_the_title($plan_id),
			);
		}

		return $items;
	}

	private function count_gravity_form_events($entry_table, $active_form_ids) {
		global $wpdb;

		if (empty($active_form_ids)) {
			return 0;
		}

		$args = array_map('absint', (array) $active_form_ids);
		$query = "SELECT COUNT(*) FROM {$entry_table} WHERE form_id IN (" . implode(',', array_fill(0, count($args), '%d')) . ")";

		return (int) $wpdb->get_var($wpdb->prepare($query, $args));
	}

	private function get_gravity_forms_feed($mode, $cursor, $page, $limit) {
		global $wpdb;

		$entry_table     = $wpdb->prefix . 'gf_entry';
		$form_table      = $wpdb->prefix . 'gf_form';
		$active_form_ids = $this->get_active_gravity_form_ids();

		if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $entry_table)) !== $entry_table) {
			return $this->empty_feed('GRAVITY_FORMS', $mode, $page);
		}

		if (empty($active_form_ids)) {
			return $this->empty_feed('GRAVITY_FORMS', $mode, $page);
		}
		$estimated_total = 'BACKFILL' === $mode ? $this->count_gravity_form_events($entry_table, $active_form_ids) : null;

		$where_clauses = array(
			'e.form_id IN (' . implode(',', array_fill(0, count($active_form_ids), '%d')) . ')',
		);
		$args = array_map('absint', $active_form_ids);

		if ('INCREMENTAL' === $mode && $cursor) {
			$where_clauses[] = 'e.date_updated > %s';
			$args[] = $this->gmt_mysql_from_cursor($cursor);
		}

		$where = 'WHERE ' . implode(' AND ', $where_clauses);

		$offset = ($page - 1) * $limit;
		$query  = "SELECT e.id, e.form_id, e.date_created, e.date_updated, e.created_by, e.payment_amount, e.payment_status, e.payment_method, e.transaction_id, e.currency, f.title
				FROM {$entry_table} e
				LEFT JOIN {$form_table} f ON f.id = e.form_id
				{$where}
				ORDER BY e.date_created DESC
				LIMIT %d OFFSET %d";

		$args[]      = $limit;
		$args[]      = $offset;
		$rows        = $wpdb->get_results($wpdb->prepare($query, $args), ARRAY_A);
		$items       = array();
		$next_cursor = null;

		foreach ((array) $rows as $row) {
			$form_id          = (int) $row['form_id'];
			$meta             = $this->get_gravity_entry_meta((int) $row['id']);
			$profile          = $this->gravity_form_profile_from_meta($form_id, $meta);
			$interaction      = $this->get_gravity_form_interaction_config($form_id);
			$currency         = $this->gravity_forms_currency($row);
			$payment_status   = isset($row['payment_status']) ? trim((string) $row['payment_status']) : '';
			$payment_method   = isset($row['payment_method']) ? trim((string) $row['payment_method']) : '';
			$transaction_id   = isset($row['transaction_id']) ? trim((string) $row['transaction_id']) : '';
			$form_title       = $row['title'] ? $row['title'] : 'Untitled form';
			$summary_suffix   = '' !== $payment_status ? sprintf(' (%s)', $payment_status) : '';
			$mapping_hints    = array(
				array('type' => 'form_id', 'value' => (string) $form_id),
				array('type' => 'interaction_type', 'value' => $interaction['key']),
			);
			$next_cursor      = $this->iso_from_any_datetime($row['date_updated'], true);

			if ('disabled' === $interaction['key']) {
				continue;
			}

			if (! empty($interaction['tag'])) {
				$mapping_hints[] = array('type' => 'tag', 'value' => (string) $interaction['tag']);
			}

			$amount_cents = ! empty($interaction['requiresAmount']) ? $this->gravity_form_amount_cents($form_id, $row, $meta) : null;

				$items[] = array(
					'externalId'  => 'gf-entry-' . $row['id'],
					'occurredAt'  => $this->iso_from_any_datetime($row['date_created'], true),
					'email'       => $profile['email'],
					'title'       => 'donation' === $interaction['key']
						? sprintf('%s %s', $interaction['titlePrefix'], $form_title)
						: sprintf('%s: %s', $interaction['titlePrefix'], $form_title),
				'summary'     => sprintf('%s #%d submission%s', $interaction['summaryPrefix'], $form_id, $summary_suffix),
				'amountCents' => $amount_cents,
				'currency'    => $currency,
				'eventKind'   => $interaction['eventKind'],
				'laneKey'     => $interaction['laneKey'],
				'roleKey'     => $interaction['roleKey'],
				'profile'     => array(
					'fullName' => $profile['fullName'],
					'phone'    => $profile['phone'],
					'address'  => $profile['address'],
				),
				'identities'  => array(
					array('type' => 'entry', 'id' => (string) $row['id']),
				),
				'mappingHints' => $mapping_hints,
					'metadata'     => array(
						'formId'          => $form_id,
						'formTitle'       => $form_title,
						'interactionType' => $interaction['key'],
						'interactionLabel' => $interaction['label'],
					'paymentStatus'   => $payment_status,
					'paymentMethod'   => $payment_method,
					'transactionId'   => $transaction_id,
					'amountCents'     => $amount_cents,
					'currency'        => $currency,
				),
				'rawPayload'   => array(
					'entryId'         => (int) $row['id'],
					'formId'          => $form_id,
					'formTitle'       => $form_title,
					'interactionType' => $interaction['key'],
					'paymentAmount'   => isset($row['payment_amount']) ? $row['payment_amount'] : '',
					'paymentStatus'   => $payment_status,
					'paymentMethod'   => $payment_method,
					'transactionId'   => $transaction_id,
					'currency'        => $currency,
					'fieldValues'     => $meta,
				),
			);
		}

		return array(
			'source'     => 'GRAVITY_FORMS',
			'items'      => $items,
			'mode'       => $mode,
			'nextCursor' => $next_cursor,
			'page'       => $page,
			'hasMore'    => count($rows) === $limit,
			'estimatedTotal' => $estimated_total,
		);
	}

	private function get_gravity_entry_meta($entry_id) {
		global $wpdb;

		$meta_table = $wpdb->prefix . 'gf_entry_meta';
		$rows       = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT meta_key, meta_value FROM {$meta_table} WHERE entry_id = %d",
				$entry_id
			),
			ARRAY_A
		);

		$payload = array();
		foreach ((array) $rows as $row) {
			$key   = strtolower((string) $row['meta_key']);
			$value = is_string($row['meta_value']) ? $row['meta_value'] : '';

			if (false !== strpos($key, 'email') && empty($payload['email'])) {
				$payload['email'] = $value;
			}
			if (false !== strpos($key, 'first') && false !== strpos($key, 'name') && empty($payload['first_name'])) {
				$payload['first_name'] = $value;
			}
			if (false !== strpos($key, 'last') && false !== strpos($key, 'name') && empty($payload['last_name'])) {
				$payload['last_name'] = $value;
			}
			if (false !== strpos($key, 'phone') && empty($payload['phone'])) {
				$payload['phone'] = $value;
			}
			if (false !== strpos($key, 'address') && empty($payload['address'])) {
				$payload['address'] = $value;
			}

			$payload[$key] = $value;
		}

		return $payload;
	}

	private function get_gravity_forms_metadata() {
		return array_map(
			function ($form) {
				$interaction = $this->get_gravity_form_interaction_config((int) $form['id']);
				return array(
					'id'               => $form['id'],
					'title'            => $form['title'],
					'enabled'          => 'disabled' !== $interaction['key'],
					'interactionType'  => $interaction['key'],
					'interactionLabel' => $interaction['label'],
					'laneKey'          => $interaction['laneKey'],
					'eventKind'        => $interaction['eventKind'],
				);
			},
			$this->get_gravity_forms_for_settings()
		);
	}

	private function count_newsletter_send_events($sent_table) {
		global $wpdb;
		return (int) $wpdb->get_var("SELECT COUNT(*) FROM {$sent_table} WHERE status = 0");
	}

	private function count_newsletter_click_events($sent_table, $stats_table) {
		global $wpdb;

		if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $stats_table)) !== $stats_table) {
			return 0;
		}

		return (int) $wpdb->get_var(
			"SELECT COUNT(*)
			FROM (
				SELECT sent.email_id, sent.user_id
				FROM {$sent_table} sent
				INNER JOIN {$stats_table} stats
					ON stats.email_id = sent.email_id
					AND stats.user_id = sent.user_id
					AND stats.url <> ''
				WHERE sent.status = 0
					AND sent.open > 1
				GROUP BY sent.email_id, sent.user_id
			) newsletter_clicks"
		);
	}

	private function get_newsletter_send_feed($sent_table, $user_table, $email_table, $mode, $cursor, $page, $limit) {
		global $wpdb;
		$estimated_total = 'BACKFILL' === $mode ? $this->count_newsletter_send_events($sent_table) : null;

		$where = 'WHERE sent.status = 0';
		$args  = array();
		if ('INCREMENTAL' === $mode && $cursor) {
			$cursor_timestamp = strtotime((string) $cursor);
			if (false !== $cursor_timestamp && $cursor_timestamp > 0) {
				$where .= ' AND sent.time > %d';
				$args[] = $cursor_timestamp;
			}
		}

		$offset = ($page - 1) * $limit;
		$query  = "SELECT sent.email_id, sent.user_id, sent.time, users.email, users.name, users.surname, campaigns.subject, campaigns.status AS campaign_status, campaigns.type AS campaign_type
			FROM {$sent_table} sent
			INNER JOIN {$user_table} users ON users.id = sent.user_id
			INNER JOIN {$email_table} campaigns ON campaigns.id = sent.email_id
			{$where}
			ORDER BY sent.time DESC, sent.email_id DESC, sent.user_id DESC
			LIMIT %d OFFSET %d";

		$args[]      = $limit;
		$args[]      = $offset;
		$rows        = $wpdb->get_results($wpdb->prepare($query, $args), ARRAY_A);
		$items       = array();
		$next_cursor = null;

		foreach ((array) $rows as $row) {
			$timestamp = isset($row['time']) ? (int) $row['time'] : 0;
			if ($timestamp <= 0) {
				continue;
			}

			$next_cursor = gmdate('c', $timestamp);
			$subject     = isset($row['subject']) ? trim((string) $row['subject']) : '';
			$full_name   = trim(
				implode(
					' ',
					array_filter(
						array(
							isset($row['name']) ? trim((string) $row['name']) : '',
							isset($row['surname']) ? trim((string) $row['surname']) : '',
						)
					)
				)
			);
			$title       = '' !== $subject ? $subject : 'Newsletter sent';
			$summary     = '' !== $subject
				? sprintf('Sent newsletter "%s"', $subject)
				: sprintf('Sent newsletter #%s', isset($row['email_id']) ? $row['email_id'] : '');

			$items[] = array(
				'externalId' => sprintf('newsletter-send-%s-%s', $row['email_id'], $row['user_id']),
				'occurredAt' => gmdate('c', $timestamp),
				'email'      => isset($row['email']) ? trim((string) $row['email']) : '',
				'title'      => $title,
				'summary'    => $summary,
				'eventKind'  => 'email_send',
				'laneKey'    => 'EMAIL',
				'roleKey'    => null,
				'profile'    => array(
					'fullName' => '' !== $full_name ? $full_name : null,
				),
				'identities' => array(
					array(
						'type' => 'newsletter_subscriber',
						'id'   => isset($row['user_id']) ? (string) $row['user_id'] : '',
					),
					array(
						'type' => 'newsletter_campaign',
						'id'   => isset($row['email_id']) ? (string) $row['email_id'] : '',
					),
				),
				'mappingHints' => array(
					array('type' => 'tag', 'value' => 'send'),
					array('type' => 'event', 'value' => 'email_send'),
				),
				'metadata'   => array(
					'newsletterId'   => isset($row['email_id']) ? (int) $row['email_id'] : null,
					'userId'         => isset($row['user_id']) ? (int) $row['user_id'] : null,
					'campaignStatus' => isset($row['campaign_status']) ? (string) $row['campaign_status'] : null,
					'campaignType'   => isset($row['campaign_type']) ? (string) $row['campaign_type'] : null,
					'subject'        => $subject,
				),
				'rawPayload' => array(
					'newsletterId'   => isset($row['email_id']) ? (int) $row['email_id'] : null,
					'userId'         => isset($row['user_id']) ? (int) $row['user_id'] : null,
					'sentAt'         => gmdate('c', $timestamp),
					'campaignStatus' => isset($row['campaign_status']) ? (string) $row['campaign_status'] : null,
					'campaignType'   => isset($row['campaign_type']) ? (string) $row['campaign_type'] : null,
					'subject'        => $subject,
				),
			);
		}

		return array(
			'source'     => 'NEWSLETTER',
			'items'      => $items,
			'mode'       => $mode,
			'nextCursor' => $next_cursor,
			'page'       => $page,
			'hasMore'    => count($rows) === $limit,
			'estimatedTotal' => $estimated_total,
		);
	}

	private function get_newsletter_click_feed($sent_table, $user_table, $email_table, $stats_table, $mode, $cursor, $page, $limit) {
		global $wpdb;

		if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $stats_table)) !== $stats_table) {
			return $this->empty_feed('NEWSLETTER', $mode, $page);
		}
		$estimated_total = 'BACKFILL' === $mode ? $this->count_newsletter_click_events($sent_table, $stats_table) : null;

		$args   = array();
		$having = '';
		if ('INCREMENTAL' === $mode && $cursor) {
			$cursor_timestamp = strtotime((string) $cursor);
			if (false !== $cursor_timestamp && $cursor_timestamp > 0) {
				$having = 'HAVING first_click_time > %d';
				$args[] = $cursor_timestamp;
			}
		}

		$offset = ($page - 1) * $limit;
		$query  = "SELECT sent.email_id, sent.user_id, users.email, users.name, users.surname, campaigns.subject, campaigns.status AS campaign_status, campaigns.type AS campaign_type,
			MIN(stats.time) AS first_click_time,
			SUBSTRING_INDEX(GROUP_CONCAT(stats.url ORDER BY stats.time ASC SEPARATOR '\n'), '\n', 1) AS first_click_url
			FROM {$sent_table} sent
			INNER JOIN {$user_table} users ON users.id = sent.user_id
			INNER JOIN {$email_table} campaigns ON campaigns.id = sent.email_id
			INNER JOIN {$stats_table} stats ON stats.email_id = sent.email_id AND stats.user_id = sent.user_id AND stats.url <> ''
			WHERE sent.status = 0 AND sent.open > 1
			GROUP BY sent.email_id, sent.user_id, users.email, users.name, users.surname, campaigns.subject, campaigns.status, campaigns.type
			{$having}
			ORDER BY first_click_time DESC, sent.email_id DESC, sent.user_id DESC
			LIMIT %d OFFSET %d";

		$args[]      = $limit;
		$args[]      = $offset;
		$rows        = $wpdb->get_results($wpdb->prepare($query, $args), ARRAY_A);
		$items       = array();
		$next_cursor = null;

		foreach ((array) $rows as $row) {
			$timestamp = isset($row['first_click_time']) ? (int) $row['first_click_time'] : 0;
			if ($timestamp <= 0) {
				continue;
			}

			$next_cursor = gmdate('c', $timestamp);
			$subject     = isset($row['subject']) ? trim((string) $row['subject']) : '';
			$clicked_url = isset($row['first_click_url']) ? trim((string) $row['first_click_url']) : '';
			$full_name   = trim(
				implode(
					' ',
					array_filter(
						array(
							isset($row['name']) ? trim((string) $row['name']) : '',
							isset($row['surname']) ? trim((string) $row['surname']) : '',
						)
					)
				)
			);
			$title       = '' !== $subject ? 'Clicked: ' . $subject : 'Clicked newsletter';

			$items[] = array(
				'externalId' => sprintf('newsletter-click-%s-%s', $row['email_id'], $row['user_id']),
				'occurredAt' => gmdate('c', $timestamp),
				'email'      => isset($row['email']) ? trim((string) $row['email']) : '',
				'title'      => $title,
				'summary'    => $this->implode_summary(
					array(
						'' !== $subject ? sprintf('Clicked a link in "%s"', $subject) : 'Clicked a newsletter link',
						$clicked_url ? 'First URL: ' . $clicked_url : '',
					)
				),
				'eventKind'  => 'email_click',
				'laneKey'    => 'EMAIL',
				'roleKey'    => null,
				'profile'    => array(
					'fullName' => '' !== $full_name ? $full_name : null,
				),
				'identities' => array(
					array(
						'type' => 'newsletter_subscriber',
						'id'   => isset($row['user_id']) ? (string) $row['user_id'] : '',
					),
					array(
						'type' => 'newsletter_campaign',
						'id'   => isset($row['email_id']) ? (string) $row['email_id'] : '',
					),
				),
				'mappingHints' => array(
					array('type' => 'tag', 'value' => 'click'),
					array('type' => 'event', 'value' => 'email_click'),
				),
				'metadata'   => array(
					'newsletterId'   => isset($row['email_id']) ? (int) $row['email_id'] : null,
					'userId'         => isset($row['user_id']) ? (int) $row['user_id'] : null,
					'campaignStatus' => isset($row['campaign_status']) ? (string) $row['campaign_status'] : null,
					'campaignType'   => isset($row['campaign_type']) ? (string) $row['campaign_type'] : null,
					'subject'        => $subject,
					'clickedUrl'     => $clicked_url ? $clicked_url : null,
					'firstClickAt'   => gmdate('c', $timestamp),
				),
				'rawPayload' => array(
					'newsletterId'   => isset($row['email_id']) ? (int) $row['email_id'] : null,
					'userId'         => isset($row['user_id']) ? (int) $row['user_id'] : null,
					'campaignStatus' => isset($row['campaign_status']) ? (string) $row['campaign_status'] : null,
					'campaignType'   => isset($row['campaign_type']) ? (string) $row['campaign_type'] : null,
					'subject'        => $subject,
					'firstClickAt'   => gmdate('c', $timestamp),
					'firstClickUrl'  => $clicked_url ? $clicked_url : null,
				),
			);
		}

		return array(
			'source'     => 'NEWSLETTER',
			'items'      => $items,
			'mode'       => $mode,
			'nextCursor' => $next_cursor,
			'page'       => $page,
			'hasMore'    => count($rows) === $limit,
			'estimatedTotal' => $estimated_total,
		);
	}

	private function get_newsletter_feed($mode, $cursor, $page, $limit) {
		global $wpdb;

		$sent_table  = $wpdb->prefix . 'newsletter_sent';
		$user_table  = $wpdb->prefix . 'newsletter';
		$email_table = $wpdb->prefix . 'newsletter_emails';
		$stats_table = $wpdb->prefix . 'newsletter_stats';
		$tables      = array($sent_table, $user_table, $email_table);

		foreach ($tables as $table) {
			if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) !== $table) {
				return $this->get_filtered_feed('msf_crm_newsletter_events', 'NEWSLETTER', $mode, $cursor, $page, $limit);
			}
		}

		return $this->combine_feed_parts(
			'NEWSLETTER',
			$mode,
			$page,
			array(
				$this->get_newsletter_send_feed($sent_table, $user_table, $email_table, $mode, $cursor, $page, $limit),
				$this->get_newsletter_click_feed($sent_table, $user_table, $email_table, $stats_table, $mode, $cursor, $page, $limit),
			)
		);
	}

	private function get_newsletter_metadata() {
		global $wpdb;

		$email_table = $wpdb->prefix . 'newsletter_emails';
		if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $email_table)) !== $email_table) {
			return array(
				array('id' => 'send', 'name' => 'Send'),
			);
		}

		$rows = $wpdb->get_results(
			"SELECT id, subject, status, type
			FROM {$email_table}
			ORDER BY id DESC
			LIMIT 50",
			ARRAY_A
		);

		if (empty($rows)) {
			return array(
				array('id' => 'send', 'name' => 'Send'),
			);
		}

		return array_map(
			function ($row) {
				$subject = isset($row['subject']) ? trim((string) $row['subject']) : '';
				return array(
					'id'      => isset($row['id']) ? (int) $row['id'] : 0,
					'name'    => '' !== $subject ? $subject : sprintf('Newsletter #%s', isset($row['id']) ? $row['id'] : ''),
					'status'  => isset($row['status']) ? (string) $row['status'] : '',
					'type'    => isset($row['type']) ? (string) $row['type'] : '',
				);
			},
			(array) $rows
		);
	}

	private function find_existing_table($candidates) {
		global $wpdb;

		foreach ((array) $candidates as $table) {
			if (! $table) {
				continue;
			}

			$found = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table));
			if ($found === $table) {
				return $table;
			}
		}

		return null;
	}

	private function get_sign_in_table() {
		global $wpdb;
		return $this->find_existing_table(
			array(
				'make_signin',
				$wpdb->prefix . 'make_signin',
			)
		);
	}

	private function count_space_use_sign_in_events($table) {
		global $wpdb;
		return (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$table} WHERE badges NOT LIKE %s",
				'%volunteer%'
			)
		);
	}

	private function count_volunteer_shift_events() {
		global $wpdb;
		return (int) $wpdb->get_var(
			"SELECT COUNT(*)
			FROM {$wpdb->posts} posts
			INNER JOIN {$wpdb->postmeta} signout ON signout.post_id = posts.ID AND signout.meta_key = 'signout_time'
			INNER JOIN {$wpdb->postmeta} status ON status.post_id = posts.ID AND status.meta_key = 'status'
			WHERE posts.post_type = 'volunteer_session'
				AND posts.post_status = 'publish'
				AND status.meta_value = 'completed'
				AND signout.meta_value <> ''"
		);
	}

	private function count_volunteer_orientation_events() {
		global $wpdb;
		return (int) $wpdb->get_var(
			"SELECT COUNT(*)
			FROM {$wpdb->usermeta}
			WHERE meta_key = 'volunteer_orientation_completed'
				AND meta_value IN ('1', 'true', 'yes', 'on')"
		);
	}

	private function get_sign_in_badge_name($badge) {
		if ('workshop' === $badge) {
			return 'Workshop';
		}

		if ('volunteer' === $badge) {
			return 'Volunteer';
		}

		if ('other' === $badge) {
			return 'Other';
		}

		$title = get_the_title((int) $badge);
		return $title ? $title : (string) $badge;
	}

	private function is_volunteer_sign_in_badges($badges) {
		foreach ((array) $badges as $badge) {
			if ('volunteer' === sanitize_key((string) $badge)) {
				return true;
			}
		}

		return false;
	}

	private function get_space_use_sign_in_feed($table, $mode, $cursor, $page, $limit) {
		global $wpdb;
		$estimated_total = 'BACKFILL' === $mode ? $this->count_space_use_sign_in_events($table) : null;

		$where = 'WHERE badges NOT LIKE %s';
		$args  = array('%volunteer%');
		if ('INCREMENTAL' === $mode && $cursor) {
			$where  .= ' AND time > %s';
			$args[] = $this->local_mysql_from_cursor($cursor);
		}

		$offset = ($page - 1) * $limit;
		$query  = "SELECT id, time, badges, user FROM {$table} {$where} ORDER BY time DESC LIMIT %d OFFSET %d";
		$args[] = $limit;
		$args[] = $offset;
		$rows   = $wpdb->get_results($wpdb->prepare($query, $args), ARRAY_A);
		$items  = array();
		$next_cursor = null;

		foreach ((array) $rows as $row) {
			$user = get_userdata((int) $row['user']);
			if (! $user instanceof WP_User) {
				continue;
			}

			$badges = maybe_unserialize($row['badges']);
			if (! is_array($badges)) {
				$badges = '' === trim((string) $row['badges']) ? array() : array($badges);
			}

			if ($this->is_volunteer_sign_in_badges($badges)) {
				continue;
			}

			$badge_names = array_values(array_unique(array_filter(array_map(array($this, 'get_sign_in_badge_name'), $badges))));
			$next_cursor = $this->iso_from_local_mysql($row['time']);
			$title       = $badge_names ? 'Sign-in: ' . implode(', ', array_slice($badge_names, 0, 3)) : 'Sign-in';

			$items[] = array(
				'externalId' => 'sign-in-' . $row['id'],
				'occurredAt' => $this->iso_from_local_mysql($row['time']),
				'email'      => $user->user_email,
				'title'      => $title,
				'summary'    => $badge_names ? 'Badges used: ' . implode(', ', $badge_names) : 'Space use sign-in',
				'eventKind'  => 'sign_in',
				'laneKey'    => 'SPACE_USE',
				'roleKey'    => null,
				'profile'    => $this->build_user_profile($user, true),
				'identities' => $this->build_user_identities(
					$user->ID,
					array(
						array('type' => 'sign_in', 'id' => (string) $row['id']),
					)
				),
				'metadata'   => array(
					'signInId'   => (int) $row['id'],
					'badges'     => array_values($badges),
					'badgeNames' => $badge_names,
				),
				'rawPayload' => array(
					'id'         => (int) $row['id'],
					'time'       => $row['time'],
					'userId'     => (int) $row['user'],
					'badges'     => array_values($badges),
					'badgeNames' => $badge_names,
				),
			);
		}

		return array(
			'source'     => 'SIGN_IN',
			'items'      => $items,
			'mode'       => $mode,
			'nextCursor' => $next_cursor,
			'page'       => $page,
			'hasMore'    => count($rows) === $limit,
			'estimatedTotal' => $estimated_total,
		);
	}

	private function get_volunteer_shift_feed($mode, $cursor, $page, $limit) {
		global $wpdb;
		$estimated_total = 'BACKFILL' === $mode ? $this->count_volunteer_shift_events() : null;

		$where = "WHERE posts.post_type = 'volunteer_session' AND posts.post_status = 'publish' AND status.meta_value = 'completed' AND signout.meta_value <> ''";
		$args  = array();
		if ('INCREMENTAL' === $mode && $cursor) {
			$where  .= ' AND signout.meta_value > %s';
			$args[] = $this->local_mysql_from_cursor($cursor);
		}

		$offset = ($page - 1) * $limit;
		$query  = "SELECT posts.ID AS post_id, user_id.meta_value AS user_id, signin.meta_value AS signin_time, signout.meta_value AS signout_time,
			duration.meta_value AS duration_minutes, notes.meta_value AS notes, status.meta_value AS status
			FROM {$wpdb->posts} posts
			INNER JOIN {$wpdb->postmeta} user_id ON user_id.post_id = posts.ID AND user_id.meta_key = 'user_id'
			INNER JOIN {$wpdb->postmeta} signin ON signin.post_id = posts.ID AND signin.meta_key = 'signin_time'
			INNER JOIN {$wpdb->postmeta} signout ON signout.post_id = posts.ID AND signout.meta_key = 'signout_time'
			INNER JOIN {$wpdb->postmeta} status ON status.post_id = posts.ID AND status.meta_key = 'status'
			LEFT JOIN {$wpdb->postmeta} duration ON duration.post_id = posts.ID AND duration.meta_key = 'duration_minutes'
			LEFT JOIN {$wpdb->postmeta} notes ON notes.post_id = posts.ID AND notes.meta_key = 'notes'
			{$where}
			ORDER BY signout.meta_value DESC, posts.ID DESC
			LIMIT %d OFFSET %d";

		$args[]      = $limit;
		$args[]      = $offset;
		$rows        = $wpdb->get_results($wpdb->prepare($query, $args), ARRAY_A);
		$items       = array();
		$next_cursor = null;

		foreach ((array) $rows as $row) {
			$user_id     = isset($row['user_id']) ? (int) $row['user_id'] : 0;
			$user        = get_userdata($user_id);
			$occurred_at = $this->iso_from_local_mysql(isset($row['signin_time']) ? $row['signin_time'] : '');
			$signout_iso = $this->iso_from_local_mysql(isset($row['signout_time']) ? $row['signout_time'] : '');
			if (! $signout_iso) {
				continue;
			}

			$next_cursor      = $signout_iso;
			$duration_minutes = isset($row['duration_minutes']) ? (int) $row['duration_minutes'] : 0;
			$duration_label   = $this->format_duration_minutes($duration_minutes);
			$notes            = isset($row['notes']) ? trim((string) $row['notes']) : '';

			$items[] = array(
				'externalId' => 'volunteer-shift-' . (int) $row['post_id'],
				'occurredAt' => $occurred_at ? $occurred_at : $signout_iso,
				'email'      => $user instanceof WP_User ? $user->user_email : '',
				'title'      => 'Volunteer shift',
				'summary'    => $this->implode_summary(
					array(
						$signout_iso ? 'Ended ' . $this->display_datetime($signout_iso) : '',
						$duration_label ? 'Duration: ' . $duration_label : '',
						$notes ? 'Notes: ' . $notes : '',
					)
				),
				'eventKind'  => 'volunteer_shift',
				'laneKey'    => 'VOLUNTEER',
				'roleKey'    => 'volunteer',
				'profile'    => $this->build_user_profile($user, true),
				'identities' => $this->build_user_identities(
					$user_id,
					array(
						array('type' => 'volunteer_session', 'id' => (string) $row['post_id']),
					)
				),
				'mappingHints' => array(
					array('type' => 'tag', 'value' => 'volunteer'),
					array('type' => 'event', 'value' => 'volunteer_shift'),
					array('type' => 'role', 'value' => 'volunteer'),
				),
				'metadata'   => array(
					'sessionId'       => (int) $row['post_id'],
					'userId'          => $user_id ?: null,
					'signInAt'        => $occurred_at,
					'signOutAt'       => $signout_iso,
					'durationMinutes' => $duration_minutes > 0 ? $duration_minutes : null,
					'notes'           => $notes ? $notes : null,
					'status'          => isset($row['status']) ? (string) $row['status'] : 'completed',
				),
				'rawPayload' => array(
					'postId'          => (int) $row['post_id'],
					'userId'          => $user_id ?: null,
					'signinTime'      => isset($row['signin_time']) ? $row['signin_time'] : null,
					'signoutTime'     => isset($row['signout_time']) ? $row['signout_time'] : null,
					'durationMinutes' => $duration_minutes > 0 ? $duration_minutes : null,
					'notes'           => $notes ? $notes : null,
					'status'          => isset($row['status']) ? (string) $row['status'] : 'completed',
				),
			);
		}

		return array(
			'source'     => 'SIGN_IN',
			'items'      => $items,
			'mode'       => $mode,
			'nextCursor' => $next_cursor,
			'page'       => $page,
			'hasMore'    => count($rows) === $limit,
			'estimatedTotal' => $estimated_total,
		);
	}

	private function get_volunteer_orientation_feed($mode, $cursor, $page, $limit) {
		global $wpdb;
		$estimated_total = 'BACKFILL' === $mode ? $this->count_volunteer_orientation_events() : null;

		$where = "WHERE completed.meta_key = 'volunteer_orientation_completed' AND completed.meta_value IN ('1', 'true', 'yes', 'on')";
		$args  = array();
		if ('INCREMENTAL' === $mode && $cursor) {
			$where  .= " AND COALESCE(NULLIF(orientation.meta_value, ''), users.user_registered) > %s";
			$args[] = $this->local_mysql_from_cursor($cursor);
		}

		$offset = ($page - 1) * $limit;
		$query  = "SELECT users.ID AS user_id, users.user_email, users.user_registered,
			orientation.meta_value AS orientation_date
			FROM {$wpdb->users} users
			INNER JOIN {$wpdb->usermeta} completed ON completed.user_id = users.ID
			LEFT JOIN {$wpdb->usermeta} orientation ON orientation.user_id = users.ID AND orientation.meta_key = 'volunteer_orientation_date'
			{$where}
			ORDER BY COALESCE(NULLIF(orientation.meta_value, ''), users.user_registered) DESC, users.ID DESC
			LIMIT %d OFFSET %d";

		$args[]      = $limit;
		$args[]      = $offset;
		$rows        = $wpdb->get_results($wpdb->prepare($query, $args), ARRAY_A);
		$items       = array();
		$next_cursor = null;

		foreach ((array) $rows as $row) {
			$user_id              = isset($row['user_id']) ? (int) $row['user_id'] : 0;
			$user                 = get_userdata($user_id);
			$raw_orientation_date = isset($row['orientation_date']) ? trim((string) $row['orientation_date']) : '';
			$date_estimated       = '' === $raw_orientation_date;
			$occurred_at          = $raw_orientation_date
				? $this->iso_from_any_datetime($raw_orientation_date)
				: $this->iso_from_any_datetime(isset($row['user_registered']) ? $row['user_registered'] : '');

			if (! $occurred_at) {
				continue;
			}

			$next_cursor = $occurred_at;

			$items[] = array(
				'externalId' => 'volunteer-orientation-' . $user_id,
				'occurredAt' => $occurred_at,
				'email'      => $user instanceof WP_User ? $user->user_email : (isset($row['user_email']) ? trim((string) $row['user_email']) : ''),
				'title'      => 'Volunteer orientation completed',
				'summary'    => $date_estimated
					? 'Volunteer orientation recorded; original completion date unavailable.'
					: 'Volunteer orientation completed.',
				'eventKind'  => 'volunteer_orientation_completed',
				'laneKey'    => 'VOLUNTEER',
				'roleKey'    => 'volunteer',
				'profile'    => $this->build_user_profile($user, true),
				'identities' => $this->build_user_identities(
					$user_id,
					array(
						array('type' => 'volunteer_orientation', 'id' => (string) $user_id),
					)
				),
				'mappingHints' => array(
					array('type' => 'tag', 'value' => 'volunteer'),
					array('type' => 'tag', 'value' => 'orientation'),
					array('type' => 'event', 'value' => 'volunteer_orientation_completed'),
					array('type' => 'role', 'value' => 'volunteer'),
				),
				'metadata'   => array(
					'userId'          => $user_id ?: null,
					'orientationDate' => $occurred_at,
					'dateEstimated'   => $date_estimated,
				),
				'rawPayload' => array(
					'userId'             => $user_id ?: null,
					'orientationDateRaw' => $raw_orientation_date ? $raw_orientation_date : null,
					'userRegistered'     => isset($row['user_registered']) ? (string) $row['user_registered'] : null,
					'dateEstimated'      => $date_estimated,
				),
			);
		}

		return array(
			'source'     => 'SIGN_IN',
			'items'      => $items,
			'mode'       => $mode,
			'nextCursor' => $next_cursor,
			'page'       => $page,
			'hasMore'    => count($rows) === $limit,
			'estimatedTotal' => $estimated_total,
		);
	}

	private function get_sign_in_feed($mode, $cursor, $page, $limit) {
		$table = $this->get_sign_in_table();
		$feeds = array();

		if ($table) {
			$feeds[] = $this->get_space_use_sign_in_feed($table, $mode, $cursor, $page, $limit);
		} else {
			$feeds[] = $this->get_filtered_feed('msf_crm_sign_in_events', 'SIGN_IN', $mode, $cursor, $page, $limit);
		}

		$feeds[] = $this->get_volunteer_shift_feed($mode, $cursor, $page, $limit);
		$feeds[] = $this->get_volunteer_orientation_feed($mode, $cursor, $page, $limit);

		return $this->combine_feed_parts('SIGN_IN', $mode, $page, $feeds);
	}

	private function get_sign_in_metadata() {
		$table = $this->get_sign_in_table();
		if (! $table) {
			$items = apply_filters('msf_crm_sign_in_metadata', array());
			$items[] = array(
				'id'   => 'volunteer_shift',
				'name' => 'Volunteer Shift',
			);
			$items[] = array(
				'id'   => 'volunteer_orientation_completed',
				'name' => 'Volunteer Orientation',
			);
			return $items;
		}

		global $wpdb;
		$rows     = $wpdb->get_col("SELECT badges FROM {$table} ORDER BY time DESC LIMIT 250");
		$badges   = array(
			'workshop'  => 'Workshop',
			'volunteer' => 'Volunteer',
			'other'     => 'Other',
		);

		foreach ((array) $rows as $row) {
			$values = maybe_unserialize($row);
			if (! is_array($values)) {
				$values = '' === trim((string) $row) ? array() : array($values);
			}

			foreach ($values as $value) {
				$key = (string) $value;
				if (! isset($badges[$key])) {
					$badges[$key] = $this->get_sign_in_badge_name($value);
				}
			}
		}

		$items = array();
		foreach ($badges as $id => $name) {
			$items[] = array(
				'id'   => $id,
				'name' => $name,
			);
		}

		$items[] = array(
			'id'   => 'volunteer_shift',
			'name' => 'Volunteer Shift',
		);
		$items[] = array(
			'id'   => 'volunteer_orientation_completed',
			'name' => 'Volunteer Orientation',
		);

		return $items;
	}

	private function get_reservations_table() {
		global $wpdb;

		$candidates = array($wpdb->prefix . 'mtr_reservations');

		if (class_exists('MTR_Reservation_Repository') && method_exists('MTR_Reservation_Repository', 'table_name')) {
			array_unshift($candidates, MTR_Reservation_Repository::table_name());
		}

		return $this->find_existing_table($candidates);
	}

	private function count_reservation_events($table) {
		global $wpdb;

		$created_count = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table}");
		$cancelled_count = (int) $wpdb->get_var(
			"SELECT COUNT(*) FROM {$table}
			WHERE cancelled_at IS NOT NULL
				AND cancelled_at <> ''
				AND cancelled_at <> '0000-00-00 00:00:00'"
		);

		return $created_count + $cancelled_count;
	}

	private function get_reservation_created_event($row, $user, $tool) {
		$created_iso = $this->iso_from_gmt_mysql($row['created_at']);
		$start_iso   = $this->iso_from_gmt_mysql($row['start_utc']);
		$end_iso     = $this->iso_from_gmt_mysql($row['end_utc']);
		$tool_name   = $tool ? $tool->post_title : 'Tool reservation';

		return array(
			'externalId' => 'reservation-created-' . (int) $row['id'],
			'occurredAt' => $created_iso ? $created_iso : gmdate('c'),
			'email'      => $user instanceof WP_User ? $user->user_email : '',
			'title'      => 'Reservation: ' . $tool_name,
			'summary'    => $this->implode_summary(
				array(
					$start_iso ? 'Starts ' . $this->display_datetime($start_iso) : '',
					$end_iso ? 'Ends ' . $this->display_datetime($end_iso) : '',
					'Status: ' . ucfirst((string) $row['status']),
				)
			),
			'eventKind'  => 'reservation',
			'laneKey'    => 'RESERVER',
			'roleKey'    => 'reserver',
			'profile'    => $this->build_user_profile($user),
			'identities' => $this->build_user_identities(
				(int) $row['user_id'],
				array(
					array('type' => 'reservation', 'id' => (string) $row['id']),
					array('type' => 'tool', 'id' => (string) $row['tool_id']),
				)
			),
			'metadata'   => array(
				'reservationId' => (int) $row['id'],
				'toolId'        => (int) $row['tool_id'],
				'toolName'      => $tool_name,
				'status'        => $row['status'],
				'startUtc'      => $start_iso,
				'endUtc'        => $end_iso,
				'notes'         => $row['notes'],
			),
			'rawPayload' => $row,
		);
	}

	private function get_reservation_cancelled_event($row, $user, $tool) {
		$cancelled_iso = $this->iso_from_gmt_mysql($row['cancelled_at']);
		if (! $cancelled_iso) {
			return null;
		}

		$tool_name = $tool ? $tool->post_title : 'Tool reservation';

		return array(
			'externalId' => 'reservation-cancelled-' . (int) $row['id'],
			'occurredAt' => $cancelled_iso,
			'email'      => $user instanceof WP_User ? $user->user_email : '',
			'title'      => 'Cancelled reservation: ' . $tool_name,
			'summary'    => $this->implode_summary(
				array(
					'Cancelled on ' . $this->display_datetime($cancelled_iso),
					'Originally scheduled for ' . $this->display_datetime($this->iso_from_gmt_mysql($row['start_utc'])),
				)
			),
			'eventKind'  => 'reservation_cancelled',
			'laneKey'    => 'RESERVER',
			'roleKey'    => 'reserver',
			'profile'    => $this->build_user_profile($user),
			'identities' => $this->build_user_identities(
				(int) $row['user_id'],
				array(
					array('type' => 'reservation', 'id' => (string) $row['id']),
					array('type' => 'tool', 'id' => (string) $row['tool_id']),
				)
			),
			'metadata'   => array(
				'reservationId' => (int) $row['id'],
				'toolId'        => (int) $row['tool_id'],
				'toolName'      => $tool_name,
				'status'        => $row['status'],
				'cancelledAt'   => $cancelled_iso,
			),
			'rawPayload' => $row,
		);
	}

	private function get_reservations_feed($mode, $cursor, $page, $limit) {
		global $wpdb;

		$table = $this->get_reservations_table();
		if (! $table) {
			return $this->get_filtered_feed('msf_crm_reservations_events', 'RESERVATIONS', $mode, $cursor, $page, $limit);
		}
		$estimated_total = 'BACKFILL' === $mode ? $this->count_reservation_events($table) : null;

		$where = '';
		$args  = array();
		if ('INCREMENTAL' === $mode && $cursor) {
			$where  = 'WHERE updated_at > %s';
			$args[] = $this->gmt_mysql_from_cursor($cursor);
		}

		$offset = ($page - 1) * $limit;
		$query  = "SELECT * FROM {$table} {$where} ORDER BY updated_at DESC LIMIT %d OFFSET %d";
		$args[] = $limit;
		$args[] = $offset;
		$rows   = $wpdb->get_results($wpdb->prepare($query, $args), ARRAY_A);
		$items  = array();
		$next_cursor = null;

		foreach ((array) $rows as $row) {
			$user = get_userdata((int) $row['user_id']);
			$tool = get_post((int) $row['tool_id']);

			$created_event = $this->get_reservation_created_event($row, $user, $tool);
			if ($created_event) {
				$items[] = $created_event;
			}

			$cancelled_event = $this->get_reservation_cancelled_event($row, $user, $tool);
			if ($cancelled_event) {
				$items[] = $cancelled_event;
			}

			$next_cursor = $this->iso_from_gmt_mysql($row['updated_at']);
		}

		return array(
			'source'     => 'RESERVATIONS',
			'items'      => $items,
			'mode'       => $mode,
			'nextCursor' => $next_cursor,
			'page'       => $page,
			'hasMore'    => count($rows) === $limit,
			'estimatedTotal' => $estimated_total,
		);
	}

	private function get_reservations_metadata() {
		$tools = get_posts(
			array(
				'post_type'      => 'make_tool',
				'post_status'    => array('publish', 'private'),
				'posts_per_page' => 200,
				'fields'         => 'ids',
			)
		);

		$items = array();
		foreach ((array) $tools as $tool_id) {
			$items[] = array(
				'id'   => (int) $tool_id,
				'name' => get_the_title($tool_id),
			);
		}

		return $items;
	}

	private function get_filtered_feed($filter_name, $source_key, $mode, $cursor, $page, $limit) {
		$payload = apply_filters(
			$filter_name,
			array(
				'source'     => $source_key,
				'items'      => array(),
				'mode'       => $mode,
				'nextCursor' => null,
				'page'       => $page,
				'hasMore'    => false,
			),
			$mode,
			$cursor,
			$page,
			$limit
		);

		return wp_parse_args(
			$payload,
			array(
				'source'     => $source_key,
				'items'      => array(),
				'mode'       => $mode,
				'nextCursor' => null,
				'page'       => $page,
				'hasMore'    => false,
			)
		);
	}
}

new Make_Santa_Fe_CRM_Bridge();
