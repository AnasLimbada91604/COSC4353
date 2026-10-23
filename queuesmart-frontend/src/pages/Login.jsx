import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, saveToken } from "../api";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});

  function validate(emailValue, passwordValue) {
    const nextErrors = {};
    const trimmedEmail = emailValue.trim();

    if (!trimmedEmail) {
      nextErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!passwordValue) {
      nextErrors.password = "Password is required.";
    }

    return nextErrors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate(email, password);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: { email: email.trim(), password },
      });
      saveToken(data.token);
      navigate(data.user.role === "admin" ? "/admin" : "/dashboard");
    } catch (error) {
      setErrors({ password: error.message });
    }
  }

  return (
    <main>
      <h1>Login</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email && <p id="email-error">{errors.email}</p>}
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : undefined}
          />
          {errors.password && <p id="password-error">{errors.password}</p>}
        </div>
        <button type="submit">Log in</button>
      </form>
    </main>
  );
}

export default Login;
