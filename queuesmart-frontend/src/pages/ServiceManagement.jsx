import { useState } from "react";
import mockServices from "../data/mockServices";

function ServiceManagement() {

    // Define constants
    const MAX_NAME_LENGTH = 100;
    const MAX_DURATION = 480;
    const emptyForm = {name: "", description: "", duration: "", priority: "Normal"};

    const [services, setServices] = useState(mockServices);
    const [errors, setErrors] = useState({});
    const [form, setForm] = useState(emptyForm);
    const [editingId, setEditingId] = useState(null);

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
        } else if (values.name.length > MAX_NAME_LENGTH) { // limit name length
            nextErrors.name = `Keep it under ${MAX_NAME_LENGTH} characters.`;
        }
        if (!values.description.trim()) { // description is required
            nextErrors.description = "Description is required.";
        }
        const duration = Number(values.duration);
        if (!values.duration) { // duration is required
            nextErrors.duration = "Duration is required.";
        } else if (!Number.isInteger(duration) || duration <= 0) {
            nextErrors.duration = "Enter a whole number of minutes.";
        } else if (duration > MAX_DURATION) {
            nextErrors.duration = `Keep it under ${MAX_DURATION} minutes.`;
        }
        return nextErrors;
    }

    // submit form
    function handleSubmit(event) {
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

        // if editing, update existing service, otherwise add new service
        if (editingId !== null) {
            setServices((current) =>
                current.map((service) =>
                    service.id === editingId ? { ...service, ...cleaned } : service
                )
            );
        } else {
            setServices((current) => [
                ...current,
                { id: Date.now(), ...cleaned, queueLength: 0, isOpen: true },
            ]);
        }

        setEditingId(null);
        setForm(emptyForm);
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
            <form onSubmit={handleSubmit} noValidate>
                <div>
                    <label htmlFor="service-name">Service name</label>
                    <input
                        id="service-name"
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        maxLength={MAX_NAME_LENGTH}
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
                        max={MAX_DURATION}
                        value={form.duration}
                        onChange={handleChange}
                    />
                    {errors.duration && <p>{errors.duration}</p>}
                </div>

                <div>
                    <label htmlFor="service-priority">Priority</label>
                    <select id="service-priority" name="priority" value={form.priority} onChange={handleChange}>
                        <option value="Low">Low</option>
                        <option value="Normal">Normal</option>
                        <option value="High">High</option>
                    </select>
                </div>

                <button type="submit">{editingId !== null ? "Save changes" : "Add service"}</button>
                {editingId !== null && <button type="button" onClick={cancelEdit}>Cancel</button>}
            </form>
            {services.map((service) => (
                <article key={service.id}>
                    <h2>{service.name}</h2>
                    <p>{service.description}</p>
                    <p>Duration: {service.duration} min</p>
                    <p>Priority: {service.priority}</p>
                    <button type="button" onClick={() => startEdit(service)}>Edit</button>
                </article>
            ))}
        </main>
    );
}

export default ServiceManagement;