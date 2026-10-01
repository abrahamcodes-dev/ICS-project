jest.mock("../src/hooks/useAuth", () => ({ useAuth: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ NavigationContainer: "NavigationContainer" }));
jest.mock("../src/navigation/GuestNavigator", () => "Guest");
jest.mock("../src/navigation/PatientNavigator", () => "Patient");
jest.mock("../src/navigation/DoctorNavigator", () => "Doctor");
jest.mock("../src/navigation/AdminNavigator", () => "Administrator");
import RootNavigator from "../src/navigation/RootNavigator";
import { useAuth } from "../src/hooks/useAuth";
test.each(["identityMissing", "identityError", "loadingIdentity", "initializing"])("%s has no role navigator", status => {
  useAuth.mockReturnValue({ status, user: null, loading: status === "initializing" || status === "loadingIdentity" });
  expect(RootNavigator()).toBeNull();
});
test.each(["pending", "rejected"])("%s doctor cannot enter doctor navigator", verificationStatus => {
  useAuth.mockReturnValue({ status: "ready", loading: false, user: { role: "doctor", status: "active", verificationStatus } });
  expect(RootNavigator()).toBeNull();
});
test("disabled administrator has no role navigator", () => {
  useAuth.mockReturnValue({ status: "ready", loading: false, user: { role: "administrator", status: "disabled" } });
  expect(RootNavigator()).toBeNull();
});
test.each([["patient","Patient"],["administrator","Administrator"],["doctor","Doctor"]])("active %s routes correctly", (role, component) => {
  useAuth.mockReturnValue({ status: "ready", loading: false, user: { role, status: "active", verificationStatus: "approved" } });
  expect(RootNavigator().props.children.type).toBe(component);
});
test("signed out routes to guest", () => {
  useAuth.mockReturnValue({ status: "signedOut", loading: false, user: null });
  expect(RootNavigator().props.children.type).toBe("Guest");
});
