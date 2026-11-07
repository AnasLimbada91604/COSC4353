import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { api } from "../api";
import Profile from "./Profile";

jest.mock("../api", () => ({
  api: jest.fn(),
}));

const savedProfile = {
  id: 1,
  email: "alex@queuesmart.edu",
  fullName: "Alex Student",
  contactPhone: "713-555-0100",
  notificationPreferences: { email: true, sms: false },
};

function apiError(message, extra = {}) {
  return Object.assign(new Error(message), extra);
}

async function renderProfile(profile = savedProfile) {
  api.mockResolvedValueOnce({ profile });
  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>
  );
  await screen.findByLabelText("Full name");
}

function save() {
  return userEvent.click(screen.getByRole("button", { name: "Save" }));
}

describe("Profile", () => {
  beforeEach(() => {
    api.mockReset();
  });

  test("shows the saved profile from the API", async () => {
    await renderProfile();

    expect(api).toHaveBeenCalledWith("/profile");
    expect(screen.getByText("Signed in as alex@queuesmart.edu")).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Student");
    expect(screen.getByLabelText("Contact phone (optional)")).toHaveValue("713-555-0100");
    expect(screen.getByLabelText("Email")).toBeChecked();
    expect(screen.getByLabelText("Text message")).not.toBeChecked();
  });

  test("shows an empty phone box when none is saved", async () => {
    await renderProfile({ ...savedProfile, contactPhone: null });

    expect(screen.getByLabelText("Contact phone (optional)")).toHaveValue("");
  });

  test("submits the changes and shows what was saved", async () => {
    await renderProfile();
    api.mockResolvedValueOnce({
      profile: {
        ...savedProfile,
        fullName: "Alex Q. Student",
        contactPhone: "832-555-0199",
        notificationPreferences: { email: false, sms: true },
      },
    });

    await userEvent.clear(screen.getByLabelText("Full name"));
    await userEvent.type(screen.getByLabelText("Full name"), "  Alex Q. Student ");
    await userEvent.clear(screen.getByLabelText("Contact phone (optional)"));
    await userEvent.type(screen.getByLabelText("Contact phone (optional)"), "832-555-0199");
    await userEvent.click(screen.getByLabelText("Email"));
    await userEvent.click(screen.getByLabelText("Text message"));
    await save();

    expect(await screen.findByRole("status")).toHaveTextContent("Profile saved.");
    expect(api).toHaveBeenLastCalledWith("/profile", {
      method: "PUT",
      body: {
        fullName: "Alex Q. Student",
        contactPhone: "832-555-0199",
        notificationPreferences: { email: false, sms: true },
      },
    });
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Q. Student");
    expect(screen.getByLabelText("Text message")).toBeChecked();
  });

  test("lets a user remove their phone", async () => {
    await renderProfile();
    api.mockResolvedValueOnce({ profile: { ...savedProfile, contactPhone: null } });

    await userEvent.clear(screen.getByLabelText("Contact phone (optional)"));
    await save();

    await screen.findByRole("status");
    expect(api.mock.calls[1][1].body.contactPhone).toBe("");
    expect(screen.getByLabelText("Contact phone (optional)")).toHaveValue("");
  });

  test("requires a full name before it calls the API", async () => {
    await renderProfile();

    await userEvent.clear(screen.getByLabelText("Full name"));
    await save();

    expect(screen.getByText("Full name is required.")).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveAttribute("aria-invalid", "true");
    expect(api).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["123456", "Contact phone must be at least 7 characters."],
    ["1".repeat(21), "Contact phone must be at most 20 characters."],
    ["call me maybe", "Contact phone can only contain digits, spaces and + ( ) . -"],
  ])("rejects the phone %s before it calls the API", async (phone, message) => {
    await renderProfile();

    await userEvent.clear(screen.getByLabelText("Contact phone (optional)"));
    await userEvent.type(screen.getByLabelText("Contact phone (optional)"), phone);
    await save();

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);
  });

  test("shows field errors from the API next to the field", async () => {
    await renderProfile();
    api.mockRejectedValueOnce(
      apiError("Bad", { errors: [{ field: "contactPhone", message: "Server says no." }] })
    );

    await save();

    expect(await screen.findByText("Server says no.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("shows a general error when saving fails", async () => {
    await renderProfile();
    api.mockRejectedValueOnce(apiError("Something went wrong."));

    await save();

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
  });

  test("asks a signed-out visitor to log in", async () => {
    api.mockRejectedValueOnce(apiError("Authentication required.", { status: 401 }));
    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>
    );

    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
  });

  test("shows the error when the profile can't be loaded", async () => {
    api.mockRejectedValueOnce(apiError("Something went wrong.", { status: 500 }));
    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
  });
});
