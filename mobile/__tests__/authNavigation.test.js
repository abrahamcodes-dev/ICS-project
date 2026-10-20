jest.mock("../src/hooks/useAuth", () => ({ useAuth: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ NavigationContainer: "NavigationContainer" }));
jest.mock("../src/navigation/GuestNavigator", () => "Guest");
jest.mock("../src/navigation/PatientNavigator", () => "Patient");
jest.mock("../src/navigation/DoctorNavigator", () => "Doctor");
jest.mock("../src/navigation/AdminNavigator", () => "Administrator");
jest.mock('../src/screens/auth/AccountStatusScreen',()=> 'AccountStatus');
jest.mock('../src/screens/doctor/SubmitVerificationScreen',()=> 'Verification');
jest.mock('../src/screens/shared/NotificationsScreen',()=>({NotificationInbox:'NotificationInbox'}));
import RootNavigator from "../src/navigation/RootNavigator";
import { useAuth } from "../src/hooks/useAuth";
test.each(["identityMissing", "identityError", "loadingIdentity", "initializing"])("%s has no role navigator", status => {
  useAuth.mockReturnValue({ status, user: null, loading: status === "initializing" || status === "loadingIdentity" });
  expect(RootNavigator().type).toBe('AccountStatus');
});
test.each(["pending", "rejected"])("%s doctor cannot enter doctor navigator", verificationStatus => {
  useAuth.mockReturnValue({ status: "ready", loading: false, user: { role: "doctor", status: "active", verificationStatus } });
  expect(RootNavigator().type.name).toBe('PendingDoctor');
});
test('pending doctor notifications never open clinical routes',async()=>{
  const React=require('react'),{act,create}=require('react-test-renderer'),{Action}=require('../src/ui/design');
  jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
  useAuth.mockReturnValue({status:'ready',loading:false,user:{uid:'d',role:'doctor',status:'active',verificationStatus:'pending'}});
  let tree;await act(async()=>{tree=create(RootNavigator());});
  await act(async()=>tree.root.findByType(Action).props.onPress());
  await act(async()=>tree.root.findByType('NotificationInbox').props.open({target:'consultation',appointmentId:'a'.repeat(64)}));
  expect(tree.root.findAllByType('Doctor')).toHaveLength(0);
  expect(tree.root.findAllByType('Verification')).toHaveLength(1);
  await act(async()=>tree.unmount());
});
test("disabled administrator has no role navigator", () => {
  useAuth.mockReturnValue({ status: "ready", loading: false, user: { role: "administrator", status: "disabled" } });
  expect(RootNavigator().type).toBe('AccountStatus');
});
test.each([["patient","Patient"],["administrator","Administrator"],["doctor","Doctor"]])("active %s routes correctly", (role, component) => {
  useAuth.mockReturnValue({ status: "ready", loading: false, user: { role, status: "active", verificationStatus: "approved" } });
  expect(RootNavigator().props.children.type).toBe(component);
});
test("signed out routes to guest", () => {
  useAuth.mockReturnValue({ status: "signedOut", loading: false, user: null });
  expect(RootNavigator().props.children.type).toBe("Guest");
});
