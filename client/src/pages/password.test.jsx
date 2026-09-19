import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { USER, makeToken, renderApp } from "../test/utils";

const home = () =>
  server.use(
    http.get("*/api/places", () => HttpResponse.json({ places: [], page: 1, limit: 12, total: 0, totalPages: 0 })),
    http.get("*/api/places/destinations", () => HttpResponse.json([])),
  );

// Password reset endpoints; `calls` records each request body by step.
const resetApi = ({ forgot, verify, reset } = {}) => {
  const calls = { forgot: [], verify: [], reset: [] };
  server.use(
    http.post("*/api/users/password/forgot", async ({ request }) => {
      calls.forgot.push(await request.json());
      return forgot?.() ?? HttpResponse.json({ message: "sent", resendAfterSeconds: 60 }, { status: 202 });
    }),
    http.post("*/api/users/password/verify", async ({ request }) => {
      calls.verify.push(await request.json());
      return verify?.() ?? HttpResponse.json({ resetToken: "reset-token", expiresInSeconds: 900 });
    }),
    http.post("*/api/users/password/reset", async ({ request }) => {
      calls.reset.push(await request.json());
      return reset?.() ?? HttpResponse.json({ user: USER, token: makeToken(USER) });
    }),
  );
  return calls;
};

const submitEmail = async (user, email = "amina@example.com") => {
  const input = screen.getByLabelText("Email");
  await user.clear(input);
  if (email) await user.type(input, email);
  await user.click(screen.getByRole("button", { name: "Send code" }));
};

describe("password reset", () => {
  it("links from the login page, carrying the email typed there", async () => {
    home();
    const user = userEvent.setup();
    renderApp("/login");
    await user.type(screen.getByLabelText("Email"), "amina@example.com");
    await user.click(screen.getByRole("link", { name: "Forgot password?" }));
    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("amina@example.com");
    await waitFor(() => expect(document.title).toBe("Reset your password | AirBuenas"));
  });

  it("resets the password with the emailed code and logs the user in", async () => {
    home();
    const calls = resetApi();
    const user = userEvent.setup();
    const { router } = renderApp("/forgot-password");
    await submitEmail(user);

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByText("amina@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend code in 60s" })).toBeDisabled();
    const codeInput = screen.getByLabelText("6-digit code");
    expect(codeInput).toHaveAttribute("autocomplete", "one-time-code");
    await user.type(codeInput, "12a3-4567"); // only digits, at most 6
    expect(codeInput).toHaveValue("123456");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Choose a new password" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("New password"), "a brand new password");
    await user.type(screen.getByLabelText("Confirm new password"), "a brand new password");
    await user.click(screen.getByRole("button", { name: "Save password" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByText("Password updated. You’re logged in.")).toBeInTheDocument();
    expect(localStorage.getItem("token")).toBeTruthy();
    expect(calls).toEqual({
      forgot: [{ email: "amina@example.com" }],
      verify: [{ email: "amina@example.com", code: "123456" }],
      reset: [{ resetToken: "reset-token", password: "a brand new password" }],
    });
  });

  it("checks each step before asking the server", async () => {
    const calls = resetApi();
    const user = userEvent.setup();
    renderApp("/forgot-password");
    await submitEmail(user, "");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your email address.");
    await submitEmail(user);

    await screen.findByLabelText("6-digit code");
    await user.type(screen.getByLabelText("6-digit code"), "123");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the 6-digit code from the email.");
    await user.type(screen.getByLabelText("6-digit code"), "456");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByLabelText("New password");
    await user.type(screen.getByLabelText("New password"), "short");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Use at least 8 characters for your password.");
    await user.type(screen.getByLabelText("New password"), " but longer");
    await user.type(screen.getByLabelText("Confirm new password"), "something else");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The passwords don’t match.");
    expect(calls.reset).toEqual([]);
  });

  it("shows the server's reasons and lets the user start again", async () => {
    resetApi({
      verify: () => HttpResponse.json({ error: "That code is incorrect or has expired." }, { status: 400 }),
    });
    const user = userEvent.setup();
    renderApp("/forgot-password");
    await submitEmail(user);
    await user.type(await screen.findByLabelText("6-digit code"), "000000");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code is incorrect or has expired.");

    await user.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByLabelText("Email")).toHaveValue("amina@example.com");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends the user back to the start when the reset has expired", async () => {
    resetApi({ reset: () => HttpResponse.json({ error: "This password reset has expired. Please start again." }, { status: 400 }) });
    const user = userEvent.setup();
    renderApp("/forgot-password");
    await submitEmail(user);
    await user.type(await screen.findByLabelText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(await screen.findByLabelText("New password"), "a brand new password");
    await user.type(screen.getByLabelText("Confirm new password"), "a brand new password");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please start again.");
    expect(localStorage.getItem("token")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
  });

  it("reports rate limits and outages when asking for a code", async () => {
    resetApi({ forgot: () => HttpResponse.json({ error: "Too many password reset attempts." }, { status: 429 }) });
    const user = userEvent.setup();
    renderApp("/forgot-password");
    await submitEmail(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many password reset attempts.");
    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    server.use(http.post("*/api/users/password/forgot", () => HttpResponse.error()));
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(screen.getByRole("alert")).not.toHaveTextContent("Too many"));
  });

  it("resends the code once the wait is over", async () => {
    let wait = 1;
    const calls = resetApi({ forgot: () => HttpResponse.json({ message: "sent", resendAfterSeconds: wait }, { status: 202 }) });
    const user = userEvent.setup();
    renderApp("/forgot-password");
    await submitEmail(user);
    expect(await screen.findByRole("button", { name: "Resend code in 1s" })).toBeDisabled();
    const resend = await screen.findByRole("button", { name: "Resend code" }, { timeout: 3000 });
    wait = undefined; // the server's default
    await user.click(resend);
    expect(await screen.findByText("We sent you a new code.")).toBeInTheDocument();
    expect(calls.forgot).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Resend code in 60s" })).toBeDisabled();
  });
});
