import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessWorkspace,
  canAccessWorkspaceMembership,
  isWorkspaceMember,
  type WorkspaceMembershipIdentity,
} from "../src/lib/workspace-access.ts";

test("workspace membership prevents reads and writes across agencies", () => {
  const memberOfAgencyA: WorkspaceMembershipIdentity = {
    userId: "user-a",
    workspaceId: 11,
  };

  assert.equal(isWorkspaceMember(memberOfAgencyA, "user-a", 11), true);
  assert.equal(isWorkspaceMember(memberOfAgencyA, "user-a", 22), false);
  assert.equal(isWorkspaceMember(memberOfAgencyA, "user-b", 11), false);
  assert.equal(canAccessWorkspace("agent", "read"), true);
  assert.equal(canAccessWorkspace("agent", "write"), true);
  assert.equal(canAccessWorkspace("viewer", "read"), true);
  assert.equal(canAccessWorkspace("viewer", "write"), false);
  assert.equal(canAccessWorkspace("agent", "manage"), false);
  assert.equal(canAccessWorkspace("admin", "manage"), true);
  assert.equal(
    canAccessWorkspaceMembership(
      { ...memberOfAgencyA, role: "agent" },
      "user-a",
      11,
      "write",
    ),
    true,
  );
  assert.equal(
    canAccessWorkspaceMembership(
      { ...memberOfAgencyA, role: "agent" },
      "user-a",
      22,
      "read",
    ),
    false,
  );
  assert.equal(
    canAccessWorkspaceMembership(
      { ...memberOfAgencyA, role: "viewer" },
      "user-a",
      11,
      "write",
    ),
    false,
  );
});