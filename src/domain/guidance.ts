// Deterministic guidance only. Does not judge the legal adequacy of free text.

const VAGUE = new Set([
  "customer data",
  "client data",
  "user data",
  "personal data",
  "contact details",
  "contact data",
  "customer information",
  "personal information",
  "data",
  "information",
  "details",
]);

export function isVagueCategory(name: string): boolean {
  return VAGUE.has(name.trim().toLowerCase().replace(/\s+/g, " "));
}

export const VAGUE_CATEGORY_HINT =
  "This looks broad. Name the specific data items instead, for example “email address” and “date of birth” rather than “contact details”.";

export function shortAnswerHint(text: string | undefined, minWords = 5): string | null {
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean).length;
  if (words === 0 || words >= minWords) return null;
  return "This answer is very short. Consider adding detail so a reader unfamiliar with the project can follow it.";
}

export const SUGGESTED_PARTIES = [
  "Harbour Bank",
  "Harbour Insurance",
  "Harbour Asset Management",
];
export const SUGGESTED_DATA_SUBJECTS = [
  "Customers",
  "Employees",
  "Job applicants",
  "Prospective customers",
  "Beneficiaries",
];
export const SUGGESTED_DATA_CATEGORIES = [
  "Full name",
  "Email address",
  "Phone number",
  "Date of birth",
  "Postal address",
  "National identification number",
  "Bank account number",
  "Transaction history",
  "Income details",
];
