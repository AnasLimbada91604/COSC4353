import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { api } from "../api";
import JoinQueue from "./JoinQueue";

jest.mock("../api", () => ({
  api: jest.fn(),
}));

const advising = {
  id: 1,
  name: "Academic Advising",
  description: "Course planning and degree questions",
  isOpen: true,
};
const financialAid = { id: 2, name: "Financial Aid", description: "Aid questions", isOpen: true };
const registrar = { id: 3, name: "Registrar", description: "Records", isOpen: false };

const inAdvising = {
  inQueue: true,
  position: 5,
  estimatedWaitMinutes: 75,
  service: { id: 1, name: "Academic Advising" },
};

function mockApi({ status = { inQueue: false } } = {}) {
  let peopleInLine = status.inQueue ? 5 : 4;
  api.mockImplementation(async (path, options) => {
    switch (path) {
      case "/queue/services":
        return { services: [advising, financialAid, registrar] };
      case "/queue/status":
        return status;
      case "/queue/1/estimate":
        return {
          serviceId: 1,
          peopleInLine,
          minutesPerPerson: 15,
          estimatedWaitMinutes: (peopleInLine + 1) * 15,
        };
      case "/queue/2/estimate":
        return { serviceId: 2, peopleInLine: 7, minutesPerPerson: 20, estimatedWaitMinutes: 160 };
      case "/queue/join":
        expect(options).toEqual({ method: "POST", body: { serviceId: 1 } });
        peopleInLine += 1;
        return { ...inAdvising, notifications: [{ message: "You joined the Academic Advising queue." }] };
      case "/queue/leave":
        expect(options).toEqual({ method: "POST" });
        peopleInLine -= 1;
        return { inQueue: false };
      default:
        throw new Error(`Unexpected request: ${path}`);
    }
  });
}

function renderJoinQueue() {
  return render(
    <MemoryRouter>
      <JoinQueue />
    </MemoryRouter>,
  );
}

describe("Join Queue", () => {
  beforeEach(() => {
    api.mockReset();
  });

  test("loads open services from the API and names the closed ones", async () => {
    mockApi();

    renderJoinQueue();

    expect(await screen.findByRole("option", { name: "Academic Advising" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Financial Aid" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Registrar" })).not.toBeInTheDocument();
    expect(screen.getByText(/Closed right now: Registrar/)).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/queue/services");
  });

  test("shows the saved line length and wait for the selected service", async () => {
    mockApi();

    renderJoinQueue();

    expect(await screen.findByText("People in line: 4")).toBeInTheDocument();
    expect(screen.getByText(/Estimated wait if you join now: 1 hr 15 min/)).toBeInTheDocument();
  });

  test("shows the spot saved from an earlier visit when the page loads", async () => {
    mockApi({ status: inAdvising });

    renderJoinQueue();

    expect(await screen.findByText(/You are #5 in line for Academic Advising/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave queue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join queue" })).not.toBeInTheDocument();
    expect(screen.getByText("You're already in this queue.")).toBeInTheDocument();
  });

  test("joins through the API, then shows the notice and the longer line", async () => {
    mockApi();

    renderJoinQueue();
    await screen.findByText("People in line: 4");
    userEvent.click(screen.getByRole("button", { name: "Join queue" }));

    expect(await screen.findByRole("status")).toHaveTextContent("You joined the Academic Advising queue.");
    expect(screen.getByText(/You are #5 in line/)).toBeInTheDocument();
    expect(await screen.findByText("People in line: 5")).toBeInTheDocument();
  });

  test("shows the server's reason when a join is rejected", async () => {
    mockApi();

    renderJoinQueue();
    const button = await screen.findByRole("button", { name: "Join queue" });
    api.mockRejectedValueOnce(new Error("That queue is closed right now."));
    userEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("That queue is closed right now.");
    expect(screen.queryByText(/You are #/)).not.toBeInTheDocument();
  });

  test("leaves through the API after confirming", async () => {
    mockApi({ status: inAdvising });

    renderJoinQueue();
    userEvent.click(await screen.findByRole("button", { name: "Leave queue" }));
    userEvent.click(screen.getByRole("button", { name: "Yes, leave queue" }));

    expect(await screen.findByRole("status")).toHaveTextContent("You left the Academic Advising queue.");
    expect(screen.getByRole("button", { name: "Join queue" })).toBeInTheDocument();
    expect(await screen.findByText("People in line: 4")).toBeInTheDocument();
  });

  test("doesn't call the API if the user decides to stay", async () => {
    mockApi({ status: inAdvising });

    renderJoinQueue();
    userEvent.click(await screen.findByRole("button", { name: "Leave queue" }));
    userEvent.click(screen.getByRole("button", { name: "Stay in queue" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Leave queue" })).toBeInTheDocument());
    expect(api).not.toHaveBeenCalledWith("/queue/leave", expect.anything());
  });

  test("won't offer a join for a different service while in a queue", async () => {
    mockApi({ status: inAdvising });

    renderJoinQueue();
    const select = await screen.findByLabelText("Service");
    userEvent.selectOptions(select, "2");

    expect(await screen.findByText(/You can be in one queue at a time/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join queue" })).not.toBeInTheDocument();
  });

  test("offers a log in link when the session has expired", async () => {
    api.mockRejectedValue(new Error("Invalid or expired token."));

    renderJoinQueue();

    expect(await screen.findByRole("link", { name: "Log in" })).toBeInTheDocument();
  });
});
