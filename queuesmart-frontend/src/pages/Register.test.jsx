import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../api";
import Register from "./Register";

jest.mock("../api", () => ({
  api: jest.fn(),
}));

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={["/register"]}>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<h1>Login</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

async function fillAccount({ name = "Alex Student", email = "alex@queuesmart.edu", password = "password123" } = {}) {
  await userEvent.type(screen.getByLabelText("Full name"), name);
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
}

describe("Register", () => {
  beforeEach(() => {
    api.mockReset();
  });

  test("requires a full name, email, and password before it calls the API", async () => {
    renderRegister();

    await userEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(screen.getByText("Full name is required.")).toBeInTheDocument();
    expect(screen.getByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  test("rejects an invalid email and a short password", async () => {
    renderRegister();
    await fillAccount({ email: "not-an-email", password: "short" });

    await userEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  test("registers a user and opens the login screen", async () => {
    api.mockResolvedValue({
      user: {
        id: 1,
        fullName: "Alex Student",
        email: "alex@queuesmart.edu",
        role: "user",
      },
    });
    renderRegister();
    await fillAccount();

    await userEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Login" })).toBeInTheDocument());
    expect(api).toHaveBeenCalledWith("/auth/register", {
      method: "POST",
      body: {
        fullName: "Alex Student",
        email: "alex@queuesmart.edu",
        password: "password123",
        role: "user",
      },
    });
  });

  test("shows a duplicate email error from the API", async () => {
    const error = new Error("An account with that email already exists.");
    error.errors = [{ field: "email", message: "An account with that email already exists." }];
    api.mockRejectedValue(error);
    renderRegister();
    await fillAccount();

    await userEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByText("An account with that email already exists.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Login" })).not.toBeInTheDocument();
  });
});
