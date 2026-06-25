import { redirect } from "next/navigation";

import { config } from "@/lib/config";
import { getSession } from "@/lib/auth";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; force?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const session = await getSession();
  const error = resolvedSearchParams.error?.trim() ?? "";
  const force = resolvedSearchParams.force?.trim() === "1";

  if (session && !force && !error) {
    redirect("/");
  }

  const errorMessage = error || "";

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="section-stack">
          <span className="eyebrow">Login</span>
          <h1 className="hero-title">Sign in</h1>
        </div>

        <div className="divider" />

        {errorMessage ? <div className="inline-alert inline-alert-error">{errorMessage}</div> : null}

        <form action="/api/auth/wordpress/exchange" className="section-stack" method="post">
          <div className="field-grid">
            <div className="field">
              <label>
                Username
                <input name="username" placeholder="wordpress-username" required />
              </label>
            </div>

            <div className="field">
              <label>
                Application Password
                <input name="applicationPassword" placeholder="xxxx xxxx xxxx xxxx" required type="password" />
              </label>
            </div>
          </div>

          <input name="returnTo" type="hidden" value="/" />

          <div className="button-row">
            <button className="button" type="submit">
              Sign in
            </button>
          </div>
        </form>

        <div className="divider" />

        {config.allowDevLogin ? (
          <>
            <div className="divider" />
            <form action="/api/auth/wordpress/exchange" method="post">
              <input name="username" type="hidden" value="demo" />
              <input name="applicationPassword" type="hidden" value="demo" />
              <input name="returnTo" type="hidden" value="/" />
              <button className="button-secondary" type="submit">
                Use development demo login
              </button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}
