import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../api";
import AdminDashboard from "./AdminDashboard";

jest.mock("../api", () => ({
  api: jest.fn(),
}));

const tutoring = {
  id: 8,
  name: "Tutoring",
  description: "Homework help",
  duration: 30,
  priority: "Medium",
  queueLength: 1,
  isOpen: true,
};

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/login" element={<h1>Login</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Admin Dashboard", () => {
  beforeEach(() => {
    api.mockReset();
  });

  test("loads services from the API", async () => {
    api.mockResolvedValue({ services: [tutoring] });

    renderDashboard();

    expect(screen.getByText("Loading services...")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Tutoring" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Academic Advising" })).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/services");
  });

  test("opens or closes a queue through the API", async () => {
    api.mockResolvedValueOnce({ services: [tutoring] });
    api.mockResolvedValueOnce({ service: { ...tutoring, isOpen: false } });
    renderDashboard();

    await userEvent.click(await screen.findByRole("button", { name: "Close queue" }));

    expect(await screen.findByRole("button", { name: "Open queue" })).toBeInTheDocument();
    expect(api).toHaveBeenLastCalledWith("/services/8", {
      method: "PATCH",
      body: { isOpen: false },
    });
  });

  test("sends an anonymous visitor to login", async () => {
    const error = new Error("Authentication required.");
    error.status = 401;
    api.mockRejectedValue(error);

    renderDashboard();

    expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument();
  });

  test("tells a signed-in user that the dashboard is for admins", async () => {
    const error = new Error("You do not have permission to do that.");
    error.status = 403;
    api.mockRejectedValue(error);

    renderDashboard();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Only admins can view the dashboard. Log in with an admin account.");
    await waitFor(() => expect(screen.queryByText("Loading services...")).not.toBeInTheDocument());
  });
});
