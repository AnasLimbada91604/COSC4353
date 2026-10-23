import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { priorityOptions } from "../data/priorities";

function ServiceManagement() {

    // Define constants
    const maxNameLength = 100;
    const maxDuration = 480;
    const maxDescriptionLength = 500;
    const emptyForm = {name: "", description: "", duration: "", priority: "Medium"};

    const navigate = useNavigate();
    const nameInputRef = useRef(null);
    const [services, setServices] = useState([]);
    const [errors, setErrors] = useState({});
    const [form, setForm] = useState(emptyForm);
    const [editingId, setEditingId] = useState(null);
    const [loadError, setLoadError] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // load services from the backend once, when the page opens
    useEffect(() => {
        api("/services")
            .then((data) => setServices(data.services))
            .catch((error) => {
                if (error.status === 401) {
                    navigate("/login");
                } else if (error.status === 403) {
                    setLoadError("Only admins can manage services. Log in with an admin account.");
                } else {
                    setLoadError("Can't reach the server. Try again in a moment.");
                }
            });
    }, [navigate]);

    // change value of form field
    function handleChange(event) {
        const { name, value } = event.target;
        setForm({ ...form, [name]: value });
    }

    // validate form fields
    function validate(values) {
        const nextErrors = {};
        if (!values.name.trim()) { // name is required
            nextErrors.name = "Service name is required.";
        } else if (values.name.length > maxNameLength) { // limit name length
            nextErrors.name = `Keep it under ${maxNameLength} characters.`;
        }
        if (!values.description.trim()) { // description is required
            nextErrors.description = "Description is required.";
        } else if (values.description.length > maxDescriptionLength) { // limit description length
            nextErrors.description = `Use ${maxDescriptionLength} characters or fewer.`;
        }
        const duration = Number(values.duration);
        if (!values.duration) { // duration is required
            nextErrors.duration = "Duration is required.";
        } else if (!Number.isInteger(duration) || duration <= 0) {
            nextErrors.duration = "Enter a whole number of minutes.";
        } else if (duration > maxDuration) {
            nextErrors.duration = `Use ${maxDuration} minutes or fewer.`;
        }
        if (!priorityOptions.includes(values.priority)) {
            nextErrors.priority = "Select a default priority.";
        }
        return nextErrors;
    }

    // submit form
    async function handleSubmit(event) {
        event.preventDefault();
        const nextErrors = validate(form);
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return; // stop if there are errors

        // clean up form data
        const cleaned = {
            name: form.name.trim(),
            description: form.description.trim(),
            duration: Number(form.duration),
            priority: form.priority,
        };

        // backend linking
        setIsSaving(true);
        try {
            if (editingId !== null) {
                const data = await api(`/services/${editingId}`, { method: "PUT", body: cleaned });
                setServices((current) =>
                    current.map((service) => (service.id === editingId ? data.service : service))
                );
            } else {
                const data = await api("/services", { method: "POST", body: cleaned });
                setServices((current) => [...current, data.service]);
            }
            setEditingId(null);
            setForm(emptyForm);
        } catch (error) {
            if (error.status === 401) {
                navigate("/login");
            } else if (error.errors) {
                // backend field errors -> shown under each field
                setErrors(Object.fromEntries(error.errors.map((item) => [item.field, item.message])));
            } else {
                setErrors({ form: error.message });
            }
        } finally {
            setIsSaving(false);
        }
    }

    // edit service by placing form data into state
    function startEdit(service) {
        setEditingId(service.id);
        setForm({
            name: service.name,
            description: service.description,
            duration: service.duration.toString(),
            priority: service.priority,
        });
        setErrors({});
        nameInputRef.current?.focus();
    }

    // reset form to initial state
    function cancelEdit() {
        setEditingId(null);
        setForm(emptyForm);
        setErrors({});
    }

    return (
        <main>
            <h1>Service Management</h1>
            {loadError && <p role="alert">{loadError}</p>}
            <form onSubmit={handleSubmit} noValidate>
                <div>
                    <label htmlFor="service-name">Service name</label>
                    <input
                        id="service-name"
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        maxLength={maxNameLength}
                        ref={nameInputRef}
                    />
                    {errors.name && <p>{errors.name}</p>}
                </div>

                <div>
                    <label htmlFor="service-description">Description</label>
                    <textarea
                        id="service-description"
                        name="description"
                        value={form.description}
                        onChange={handleChange}
                        maxLength={maxDescriptionLength}
                    />
                    {errors.description && <p>{errors.description}</p>}
                </div>

                <div>
                    <label htmlFor="service-duration">Expected duration (minutes)</label>
                    <input
                        id="service-duration"
                        name="duration"
                        type="number"
                        min="1"
                        max={maxDuration}
                        value={form.duration}
                        onChange={handleChange}
                    />
                    {errors.duration && <p>{errors.duration}</p>}
                </div>

                <div>
                    <label htmlFor="service-priority">Default priority</label>
                    <select
                        id="service-priority"
                        name="priority"
                        value={form.priority}
                        onChange={handleChange}
                        aria-describedby="service-priority-hint"
                    >
                        {priorityOptions.map((option) => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                    <small id="service-priority-hint" className="fieldHint">
                        New people in this queue start at this priority.
                    </small>
                    {errors.priority && <p>{errors.priority}</p>}
                </div>

                {errors.form && <p role="alert">{errors.form}</p>}
                <button type="submit" disabled={isSaving}>
                    {editingId !== null ? "Save changes" : "Add service"}
                </button>
                {editingId !== null && <button type="button" onClick={cancelEdit}>Cancel</button>}
            </form>
            {services.map((service) => (
                <article key={service.id}>
                    <h2>{service.name}</h2>
                    <p>{service.description}</p>
                    <p>Duration: {service.duration} min</p>
                    <p>Default Priority: {service.priority}</p>
                    <button type="button" onClick={() => startEdit(service)}>Edit</button>
                </article>
            ))}
        </main>
    );
}

export default ServiceManagement;