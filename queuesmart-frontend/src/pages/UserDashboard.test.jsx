import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { api } from "../api";
import UserDashboard from "./UserDashboard";

jest.mock("../api", () => ({
  api: jest.fn(),
}));

const advising = {
  id: 1,
  name: "Academic Advising",
  description: "Course planning and degree questions",
  isOpen: true,
};
const registrar = { id: 3, name: "Registrar", description: "Records", isOpen: false };

const sentNotification = {
  id: 2,
  message: "You're almost up at Academic Advising.",
  status: "sent",
  createdAt: "2026-11-05T15:30:00.000Z",
};
const viewedNotification = {
  id: 1,
  message: "You joined the Academic Advising queue.",
  status: "viewed",
  createdAt: "2026-11-05T15:00:00.000Z",
};

function mockApi({ status = { inQueue: false }, notifications = [] } = {}) {
  api.mockImplementation(async (path) => {
    switch (path) {
      case "/queue/status":
        return status;
      case "/queue/services":
        return { services: [advising, registrar] };
      case "/notifications":
        return { notifications };
      case "/queue/1/estimate":
        return { serviceId: 1, peopleInLine: 4, estimatedWaitMinutes: 75 };
      case "/notifications/2/viewed":
        return { notification: { ...sentNotification, status: "viewed" } };
      default:
        throw new Error(`Unexpected request: ${path}`);
    }
  });
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <UserDashboard />
    </MemoryRouter>,
  );
}

describe("User Dashboard", () => {
  beforeEach(() => {
    api.mockReset();
  });

  test("shows the saved queue position from the API", async () => {
    mockApi({
      status: {
        inQueue: true,
        position: 3,
        estimatedWaitMinutes: 45,
        service: { id: 1, name: "Academic Advising" },
      },
    });

    renderDashboard();

    expect(await screen.findByText(/You are #3 in line for Academic Advising/)).toBeInTheDocument();
    expect(screen.getByText(/Estimated wait: 45 min/)).toBeInTheDocument();
  });

  test("lists only open services, with line length and wait", async () => {
    mockApi();

    renderDashboard();

    const item = (await screen.findByText("Academic Advising")).closest("li");
    expect(item).toHaveTextContent("4 in line, about 1 hr 15 min wait");
    expect(screen.queryByText("Registrar")).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/queue/services");
  });

  test("tells a served user where they were served", async () => {
    mockApi({
      status: { inQueue: false, status: "served", service: { id: 1, name: "Academic Advising" } },
    });

    renderDashboard();

    expect(await screen.findByText(/You were served at Academic Advising/)).toBeInTheDocument();
  });

  test("shows each notification's saved status", async () => {
    mockApi({ notifications: [sentNotification, viewedNotification] });

    renderDashboard();

    const sent = (await screen.findByText(/You're almost up/)).closest("li");
    const viewed = screen.getByText(/You joined the Academic Advising/).closest("li");
    expect(sent).toHaveTextContent("Status: Sent");
    expect(within(sent).getByRole("button", { name: "Mark as viewed" })).toBeInTheDocument();
    expect(viewed).toHaveTextContent("Status: Viewed");
    expect(within(viewed).queryByRole("button")).not.toBeInTheDocument();
  });

  test("marks a notification viewed through the API", async () => {
    mockApi({ notifications: [sentNotification] });

    renderDashboard();

    userEvent.click(await screen.findByRole("button", { name: "Mark as viewed" }));

    expect(await screen.findByText(/Status: Viewed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as viewed" })).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/notifications/2/viewed", { method: "PATCH" });
  });

  test("keeps the notification as sent and shows why if marking fails", async () => {
    mockApi({ notifications: [sentNotification] });

    renderDashboard();
    const button = await screen.findByRole("button", { name: "Mark as viewed" });
    api.mockRejectedValueOnce(new Error("Notification not found."));
    userEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("Notification not found.");
    expect(screen.getByText(/Status: Sent/)).toBeInTheDocument();
  });

  test("shows the empty message when there are no notifications", async () => {
    mockApi();

    renderDashboard();

    expect(await screen.findByText(/No notifications yet/)).toBeInTheDocument();
  });
});
