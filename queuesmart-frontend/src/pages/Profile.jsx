import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const MAX_NAME_LENGTH = 100;
const MIN_PHONE_LENGTH = 7;
const MAX_PHONE_LENGTH = 20;

function validate(fullName, contactPhone) {
  const nextErrors = {};
  const trimmedName = fullName.trim();
  const trimmedPhone = contactPhone.trim();

  if (!trimmedName) {
    nextErrors.fullName = "Full name is required.";
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    nextErrors.fullName = `Full name must be at most ${MAX_NAME_LENGTH} characters.`;
  }

  if (trimmedPhone) {
    if (trimmedPhone.length < MIN_PHONE_LENGTH) {
      nextErrors.contactPhone = `Contact phone must be at least ${MIN_PHONE_LENGTH} characters.`;
    } else if (trimmedPhone.length > MAX_PHONE_LENGTH) {
      nextErrors.contactPhone = `Contact phone must be at most ${MAX_PHONE_LENGTH} characters.`;
    } else if (!/^[0-9+().\s-]+$/.test(trimmedPhone)) {
      nextErrors.contactPhone = "Contact phone can only contain digits, spaces and + ( ) . -";
    }
  }

  return nextErrors;
}

function Profile() {
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [preferences, setPreferences] = useState({ email: true, sms: false });
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function showProfile(profile) {
    setEmail(profile.email);
    setFullName(profile.fullName);
    setContactPhone(profile.contactPhone || "");
    setPreferences(profile.notificationPreferences);
  }

  useEffect(() => {
    api("/profile")
      .then((data) => {
        showProfile(data.profile);
        setStatus("ready");
      })
      .catch((error) => {
        setStatus(error.status === 401 ? "signed-out" : "error");
        setLoadError(error.message);
      });
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaved(false);
    const nextErrors = validate(fullName, contactPhone);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const data = await api("/profile", {
        method: "PUT",
        body: {
          fullName: fullName.trim(),
          contactPhone: contactPhone.trim(),
          notificationPreferences: preferences,
        },
      });
      showProfile(data.profile);
      setSaved(true);
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

  if (status === "loading") {
    return (
      <main>
        <h1>Profile</h1>
        <p>Loading your profile...</p>
      </main>
    );
  }

  if (status === "signed-out") {
    return (
      <main>
        <h1>Profile</h1>
        <p>
          <Link to="/login">Log in</Link> to view your profile.
        </p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main>
        <h1>Profile</h1>
        <p role="alert">{loadError}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Profile</h1>
      <p>Signed in as {email}</p>
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="profile-name">Full name</label>
          <input
            id="profile-name"
            name="fullName"
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={MAX_NAME_LENGTH}
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? "profile-name-error" : undefined}
          />
          {errors.fullName && <p id="profile-name-error">{errors.fullName}</p>}
        </div>
        <div>
          <label htmlFor="profile-phone">Contact phone (optional)</label>
          <input
            id="profile-phone"
            name="contactPhone"
            type="tel"
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            aria-invalid={Boolean(errors.contactPhone)}
            aria-describedby={errors.contactPhone ? "profile-phone-error" : undefined}
          />
          {errors.contactPhone && <p id="profile-phone-error">{errors.contactPhone}</p>}
        </div>
        <fieldset>
          <legend>Notification preferences</legend>
          <div>
            <label>
              <input
                type="checkbox"
                checked={preferences.email}
                onChange={(event) => setPreferences({ ...preferences, email: event.target.checked })}
              />
              Email
            </label>
          </div>
          <div>
            <label>
              <input
                type="checkbox"
                checked={preferences.sms}
                onChange={(event) => setPreferences({ ...preferences, sms: event.target.checked })}
              />
              Text message
            </label>
          </div>
          {errors.notificationPreferences && <p>{errors.notificationPreferences}</p>}
        </fieldset>
        {errors.form && <p role="alert">{errors.form}</p>}
        {saved && <p role="status">Profile saved.</p>}
        <button type="submit" disabled={isSubmitting}>
          Save
        </button>
      </form>
    </main>
  );
}

export default Profile;
