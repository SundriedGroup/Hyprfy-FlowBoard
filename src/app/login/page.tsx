import { ArrowRight, CalendarDays } from "lucide-react";
import { login, signup } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message } = await searchParams;
  return (
    <main className="login-shell">
      <section className="login-brand">
        <div className="brand-mark"><CalendarDays size={24} /></div>
        <p className="eyebrow">Hyprfy Flowboard · v0.9.2</p>
        <h1>Plan the moment.<br /><span>Publish the story.</span></h1>
        <p>One social planning system for daily context, AI direction, content production and the work that moves your story forward.</p>
        <div className="login-week" aria-hidden="true">
          {["MON", "TUE", "WED", "THU", "FRI"].map((day, index) => (
            <div className={index === 1 ? "active" : ""} key={day}><span>{day}</span><b>{17 + index}</b></div>
          ))}
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Welcome back</p>
          <h2>Open your Flowboard</h2>
          <p className="muted">Sign in to your Flowboard workspace.</p>
          {message && <p className="form-message">{message}</p>}
          <form>
            <label>Email<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" minLength={6} placeholder="••••••••" required /></label>
            <button className="primary-button" formAction={login}>Sign in <ArrowRight size={16} /></button>
            <button className="text-button" formAction={signup}>Create an account</button>
          </form>
        </div>
      </section>
    </main>
  );
}
