import { useState, type FormEvent } from "react";
import { Navigate, Link, useNavigate, useParams } from "react-router-dom";
import { Boxes, ArrowRight, ShieldCheck } from "lucide-react";
import { useAuth } from "../../app/Auth";
import { send } from "../../lib/api";
import { ErrorMessage } from "../../components/UI";
export function Login() {
  const { user, refresh } = useAuth();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  if (user) return <Navigate to="/app/dashboard" replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      await send("auth/login/", Object.fromEntries(form));
      await refresh();
      navigate("/app/dashboard");
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <div className="brand">
          <Boxes /> stockroom.
        </div>
        <div>
          <span className="eyebrow">LESS GUESSWORK. MORE CONTROL.</span>
          <h1>
            Every item.
            <br />
            Every movement.
            <br />
            <em>In clear view.</em>
          </h1>
          <p>A calmer way to manage your stock, warehouses, and purchasing.</p>
          <div className="auth-grid">
            <div>
              <strong>01</strong> One reliable inventory ledger
            </div>
            <div>
              <strong>02</strong> Connected warehouse operations
            </div>
            <div>
              <strong>03</strong> Decisions grounded in your stock
            </div>
          </div>
        </div>
        <small>
          <ShieldCheck size={16} /> Role-based access. Traceable operations.
        </small>
      </section>
      <section className="auth-form">
        <div>
          <span className="eyebrow">YOUR OPERATIONS, ORGANIZED</span>
          <h2>Welcome back</h2>
          <p>Sign in to your inventory workspace.</p>
          <form onSubmit={submit}>
            <label>
              Username
              <input
                name="username"
                autoComplete="username"
                required
                placeholder="you@company.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
              />
            </label>
            <ErrorMessage error={error} />
            <button className="button primary" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <Link to="/forgot-password">Forgot your password?</Link>
          <p className="form-note">
            Need access? Ask your workspace administrator for an invitation.
          </p>
        </div>
      </section>
    </div>
  );
}
export function PasswordReset() {
  const { uid, token } = useParams();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await send<{ message: string }>(
        `auth/password-reset/${uid ? "confirm" : "request"}/`,
        { ...data, uid, token },
      );
      setMessage(result.message);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="reset-page">
      <div className="panel">
        <h1>{uid ? "Choose a new password" : "Reset your password"}</h1>
        <p>
          {uid
            ? "Use at least 12 characters."
            : "We will email a link if your account exists."}
        </p>
        <form onSubmit={submit}>
          <label>
            {uid ? "New password" : "Email"}
            <input
              name={uid ? "password" : "email"}
              type={uid ? "password" : "email"}
              minLength={uid ? 12 : undefined}
              required
            />
          </label>
          <ErrorMessage error={error} />
          {message && (
            <p role="status" className="success">
              {message}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            Continue
          </button>
          <Link to="/login">Back to sign in</Link>
        </form>
      </div>
    </div>
  );
}
