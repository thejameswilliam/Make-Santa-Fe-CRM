import { redirect } from "next/navigation";

import { config } from "@/lib/config";
import { getSession } from "@/lib/auth";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect("/");
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="section-stack">
          <span className="eyebrow">Login</span>
          <h1 className="hero-title">Sign in</h1>
        </div>

        <div className="divider" />

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
