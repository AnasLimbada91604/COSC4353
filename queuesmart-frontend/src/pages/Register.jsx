import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 100;

function Register() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(nameValue, emailValue, passwordValue) {
    const nextErrors = {};
    const trimmedName = nameValue.trim();
    const trimmedEmail = emailValue.trim();

    if (!trimmedName) {
      nextErrors.fullName = "Full name is required.";
    } else if (trimmedName.length > MAX_NAME_LENGTH) {
      nextErrors.fullName = `Full name must be at most ${MAX_NAME_LENGTH} characters.`;
    }

    if (!trimmedEmail) {
      nextErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!passwordValue) {
      nextErrors.password = "Password is required.";
    } else if (passwordValue.length < MIN_PASSWORD_LENGTH) {
      nextErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }

    return nextErrors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate(fullName, email, password);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      await api("/auth/register", {
        method: "POST",
        body: {
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          role: "user",
        },
      });
      navigate("/login");
    } catch (error) {
      if (error.errors) {
        setErrors(Object.fromEntries(error.errors.map((item) => [item.field, item.message])));
      } else {
        setErrors({ form: error.message });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Register</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="register-name">Full name</label>
          <input
            id="register-name"
            name="fullName"
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={MAX_NAME_LENGTH}
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? "register-name-error" : undefined}
          />
          {errors.fullName && <p id="register-name-error">{errors.fullName}</p>}
        </div>
        <div>
          <label htmlFor="register-email">Email</label>
          <input
            id="register-email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "register-email-error" : undefined}
          />
          {errors.email && <p id="register-email-error">{errors.email}</p>}
        </div>
        <div>
          <label htmlFor="register-password">Password</label>
          <input
            id="register-password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "register-password-error" : undefined}
          />
          {errors.password && <p id="register-password-error">{errors.password}</p>}
        </div>
        {errors.form && <p role="alert">{errors.form}</p>}
        <button type="submit" disabled={isSubmitting}>
          Register
        </button>
      </form>
    </main>
  );
}

export default Register;
