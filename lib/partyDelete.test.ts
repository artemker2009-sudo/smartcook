import { describe, expect, it } from "vitest";
import { canDeleteParty } from "./partyDelete";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";

describe("canDeleteParty", () => {
  it("разрешает организатору: host_id совпадает с проверенным id", () => {
    expect(canDeleteParty(OWNER, OWNER)).toBe(true);
  });

  it("запрещает чужому пользователю", () => {
    expect(canDeleteParty(OWNER, STRANGER)).toBe(false);
  });

  it("запрещает без проверенной сессии", () => {
    expect(canDeleteParty(OWNER, null)).toBe(false);
    expect(canDeleteParty(OWNER, undefined)).toBe(false);
    expect(canDeleteParty(OWNER, "")).toBe(false);
  });

  it("запрещает, если у банкета нет организатора", () => {
    expect(canDeleteParty(null, STRANGER)).toBe(false);
    expect(canDeleteParty(undefined, STRANGER)).toBe(false);
    expect(canDeleteParty("", "")).toBe(false);
    expect(canDeleteParty("   ", "   ")).toBe(false);
  });

  it("гостевой host_id (device-id) не совпадает с аккаунтом — запрещено", () => {
    expect(canDeleteParty("guest_abc123", STRANGER)).toBe(false);
  });
});
