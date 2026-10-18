import {
  canAccessDashboard,
  canAccessTrainerConsole,
  homePathForRole,
  isPlatformStaff,
} from "../src/lib/auth/roles";
import type { PlatformRole } from "../src/lib/database.types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function runRoleTests() {
  const owner: PlatformRole = "business_owner";
  const trainer: PlatformRole = "trainer";
  const admin: PlatformRole = "admin";

  assert(canAccessDashboard(owner), "owner can access dashboard");
  assert(!canAccessDashboard(trainer), "trainer cannot access dashboard");
  assert(canAccessTrainerConsole(trainer), "trainer can access trainer console");
  assert(canAccessTrainerConsole(admin), "admin can access trainer console");
  assert(!canAccessTrainerConsole(owner), "owner cannot access trainer console");
  assert(homePathForRole(owner) === "/dashboard", "owner home is dashboard");
  assert(homePathForRole(trainer) === "/trainer", "trainer home is trainer");
  assert(isPlatformStaff(trainer), "trainer is platform staff");
  assert(!isPlatformStaff(owner), "owner is not platform staff");

  console.log("All role routing tests passed.");
}

runRoleTests();
