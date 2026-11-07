import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../api";
import QueueManagement from "./QueueManagement";

jest.mock("../api", () => ({
    api: jest.fn(),
}));

const services = [{ id: 1, name: "Academic Advising", duration: 15 }];
const advising = { id: 1, name: "Academic Advising", duration: 15 };
const joinedAt = "2026-11-05T15:00:00.000Z";

const walkIn = { id: 11, name: "Walk-in #11", priority: "High", joinedAt, position: 1 };
const priya = { id: 12, name: "priya@queuesmart.edu", priority: "Medium", joinedAt, position: 2 };

function renderQueueManagement() {
    return render(
        <MemoryRouter initialEntries={["/queue-management"]}>
            <Routes>
                <Route path="/queue-management" element={<QueueManagement />} />
                <Route path="/login" element={<h1>Login</h1>} />
            </Routes>
        </MemoryRouter>
    );
}

describe("Queue Management", () => {
    beforeEach(() => {
        api.mockReset();
    });

    test("loads the services, then the first service's line", async () => {
        api.mockResolvedValueOnce({ services });
        api.mockResolvedValueOnce({ service: advising, queue: [walkIn, priya] });

        renderQueueManagement();

        expect(await screen.findByRole("heading", { name: "Academic Advising: 2 in line" })).toBeInTheDocument();
        expect(screen.getByText("priya@queuesmart.edu")).toBeInTheDocument();
        expect(api).toHaveBeenCalledWith("/queue/1");
    });

    test("serves the next person, then reloads the line", async () => {
        api.mockResolvedValueOnce({ services });
        api.mockResolvedValueOnce({ service: advising, queue: [walkIn, priya] });
        api.mockResolvedValueOnce({ served: walkIn });
        api.mockResolvedValueOnce({ service: advising, queue: [{ ...priya, position: 1 }] });
        renderQueueManagement();
        await screen.findByText("priya@queuesmart.edu");

        await userEvent.click(screen.getByRole("button", { name: "Serve next" }));

        expect(await screen.findByText("Now serving Walk-in #11.")).toBeInTheDocument();
        expect(await screen.findByRole("heading", { name: "Academic Advising: 1 in line" })).toBeInTheDocument();
        expect(api).toHaveBeenCalledWith("/queue/1/serve", { method: "POST" });
    });

    test("asks before removing someone, then removes them", async () => {
        api.mockResolvedValueOnce({ services });
        api.mockResolvedValueOnce({ service: advising, queue: [walkIn, priya] });
        api.mockResolvedValueOnce({ service: advising, queue: [walkIn] });
        renderQueueManagement();

        const removeButtons = await screen.findAllByRole("button", { name: "Remove" });
        await userEvent.click(removeButtons[1]);
        await userEvent.click(screen.getByRole("button", { name: "Yes, remove" }));

        expect(await screen.findByText("priya@queuesmart.edu was removed from the queue.")).toBeInTheDocument();
        expect(api).toHaveBeenLastCalledWith("/queue/1/entries/12", { method: "DELETE" });
    });

    test("asks before a move that changes someone's priority", async () => {
        api.mockResolvedValueOnce({ services });
        api.mockResolvedValueOnce({ service: advising, queue: [walkIn, priya] });
        api.mockResolvedValueOnce({ service: advising, queue: [{ ...priya, priority: "High", position: 1 }, walkIn] });
        renderQueueManagement();

        const moveUpButtons = await screen.findAllByRole("button", { name: "Move up" });
        await userEvent.click(moveUpButtons[1]);

        expect(screen.getByRole("alert")).toHaveTextContent("changes their priority from Medium to High");
        await userEvent.click(screen.getByRole("button", { name: "Move and change priority" }));

        expect(await screen.findByText("priya@queuesmart.edu moved up and is now High priority.")).toBeInTheDocument();
        expect(api).toHaveBeenLastCalledWith("/queue/1/entries/12/move", { method: "PATCH", body: { direction: "up" } });
    });

    test("changes someone's priority through the API", async () => {
        api.mockResolvedValueOnce({ services });
        api.mockResolvedValueOnce({ service: advising, queue: [walkIn, priya] });
        api.mockResolvedValueOnce({ service: advising, queue: [walkIn, { ...priya, priority: "Low" }] });
        renderQueueManagement();

        await userEvent.selectOptions(await screen.findByLabelText("Priority for priya@queuesmart.edu"), "Low");

        expect(await screen.findByText("priya@queuesmart.edu priority changed to Low.")).toBeInTheDocument();
        expect(api).toHaveBeenLastCalledWith("/queue/1/entries/12/priority", { method: "PATCH", body: { priority: "Low" } });
    });

    test("tells a signed-in user that the page is for admins", async () => {
        const error = new Error("You do not have permission to do that.");
        error.status = 403;
        api.mockRejectedValue(error);

        renderQueueManagement();

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Only admins can manage queues. Log in with an admin account."
        );
    });
});