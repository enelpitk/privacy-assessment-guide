// Explicit, repeatable seed of the FICTIONAL demo users and departments (Stage 2 scope).
// Safe to run many times: it only upserts rows that carry a demoSeedKey and never deletes anything.
// Scenario assessments are added in a later stage. Usage: npm run db:seed   (needs DATABASE_URL)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEPARTMENTS = [
  { key: "demo-dept-retail", name: "Retail Banking", groupEntity: "Harbour Bank" },
  { key: "demo-dept-corporate", name: "Corporate Banking", groupEntity: "Harbour Bank" },
  { key: "demo-dept-infosec", name: "Information Security", groupEntity: "Harbour Bank" },
  { key: "demo-dept-claims", name: "Claims Operations", groupEntity: "Harbour Insurance" },
  { key: "demo-dept-underwriting", name: "Underwriting", groupEntity: "Harbour Insurance" },
  { key: "demo-dept-investment", name: "Investment Operations", groupEntity: "Harbour Asset Management" },
];

const USERS = [
  { key: "demo-user-owner-1", displayName: "Alex Rowan", jobTitle: "Head of Retail Lending (process owner)", roles: ["OWNER"], dept: "demo-dept-retail" },
  { key: "demo-user-owner-2", displayName: "Priya Nandi", jobTitle: "Claims Operations Manager (process owner)", roles: ["OWNER"], dept: "demo-dept-claims" },
  { key: "demo-user-contributor", displayName: "Sam Okafor", jobTitle: "IT Security Analyst (contributor)", roles: ["CONTRIBUTOR"], dept: "demo-dept-infosec" },
  { key: "demo-user-dpo-1", displayName: "Dana Whitfield", jobTitle: "Data Protection Officer", roles: ["DPO"], dept: null },
  { key: "demo-user-dpo-2", displayName: "Tomas Reyes", jobTitle: "Deputy Data Protection Officer", roles: ["DPO"], dept: null },
  { key: "demo-user-admin", displayName: "Morgan Hale", jobTitle: "Demo Administrator", roles: ["ADMIN"], dept: null },
];

async function main() {
  const deptIds = new Map();
  for (const d of DEPARTMENTS) {
    const row = await prisma.department.upsert({
      where: { demoSeedKey: d.key },
      update: { name: d.name, groupEntity: d.groupEntity },
      create: { demoSeedKey: d.key, name: d.name, groupEntity: d.groupEntity },
    });
    deptIds.set(d.key, row.id);
  }
  for (const u of USERS) {
    const data = {
      displayName: u.displayName,
      jobTitle: u.jobTitle,
      roles: u.roles,
      departmentId: u.dept ? deptIds.get(u.dept) : null,
    };
    await prisma.user.upsert({
      where: { demoSeedKey: u.key },
      update: data,
      create: { demoSeedKey: u.key, ...data },
    });
  }
  console.log(`Seed complete: ${DEPARTMENTS.length} departments and ${USERS.length} fictional demo users (upserted by seed key).`);
}

main()
  .catch((e) => {
    // Never print connection strings.
    console.error("Seed failed:", String(e?.message ?? e).replace(/postgres(ql)?:\/\/[^\s'"]+/gi, "[database url hidden]"));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
