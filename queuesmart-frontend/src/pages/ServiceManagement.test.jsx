import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../api";
import ServiceManagement from "./ServiceManagement";

jest.mock("../api", () => ({
    api: jest.fn(),
}));

const advising = {
    id: 1,
    name: "Academic Advising",
    description: "Course planning and degree questions",
    duration: 15,
    priority: "Medium",
};

function renderServiceManagement() {
    return render(
        <MemoryRouter initialEntries={["/services"]}>
            <Routes>
                <Route path="/services" element={<ServiceManagement />} />
                <Route path="/login" element={<h1>Login</h1>} />
            </Routes>
        </MemoryRouter>
    );
}

describe("Service Management", () => {
    beforeEach(() => {
        api.mockReset();
    });

    test("loads services from the API", async () => {
        api.mockResolvedValue({ services: [advising] });

        renderServiceManagement();

        expect(await screen.findByRole("heading", { name: "Academic Advising" })).toBeInTheDocument();
        expect(api).toHaveBeenCalledWith("/services");
    });

    test("requires a name, description, and duration before it calls the API", async () => {
        api.mockResolvedValue({ services: [advising] });
        renderServiceManagement();
        await screen.findByRole("heading", { name: "Academic Advising" });

        await userEvent.click(screen.getByRole("button", { name: "Add service" }));

        expect(screen.getByText("Service name is required.")).toBeInTheDocument();
        expect(screen.getByText("Description is required.")).toBeInTheDocument();
        expect(screen.getByText("Duration is required.")).toBeInTheDocument();
        expect(api).toHaveBeenCalledTimes(1);
    });

    test("adds a service through the API", async () => {
        api.mockResolvedValueOnce({ services: [advising] });
        api.mockResolvedValueOnce({ service: { ...advising, id: 5, name: "Tutoring" } });
        renderServiceManagement();
        await screen.findByRole("heading", { name: "Academic Advising" });

        await userEvent.type(screen.getByLabelText("Service name"), "Tutoring");
        await userEvent.type(screen.getByLabelText("Description"), "Course planning and degree questions");
        await userEvent.type(screen.getByLabelText("Expected duration (minutes)"), "15");
        await userEvent.click(screen.getByRole("button", { name: "Add service" }));

        expect(await screen.findByRole("heading", { name: "Tutoring" })).toBeInTheDocument();
        expect(api).toHaveBeenLastCalledWith("/services", {
            method: "POST",
            body: { name: "Tutoring", description: "Course planning and degree questions", duration: 15, priority: "Medium" },
        });
    });

    test("edits a service through the API", async () => {
        api.mockResolvedValueOnce({ services: [advising] });
        api.mockResolvedValueOnce({ service: { ...advising, duration: 25 } });
        renderServiceManagement();

        await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
        await userEvent.clear(screen.getByLabelText("Expected duration (minutes)"));
        await userEvent.type(screen.getByLabelText("Expected duration (minutes)"), "25");
        await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

        expect(await screen.findByText("Duration: 25 min")).toBeInTheDocument();
        expect(api).toHaveBeenLastCalledWith("/services/1", {
            method: "PUT",
            body: { name: "Academic Advising", description: "Course planning and degree questions", duration: 25, priority: "Medium" },
        });
    });

    test("tells a signed-in user that the page is for admins", async () => {
        const error = new Error("You do not have permission to do that.");
        error.status = 403;
        api.mockRejectedValue(error);

        renderServiceManagement();

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Only admins can manage services. Log in with an admin account."
        );
    });
});