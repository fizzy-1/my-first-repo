import type { EmploymentType, PrismaClient } from "@prisma/client";
import type { RoleKey } from "../../src/lib/rbac";
import { hashPassword } from "../../src/server/auth/password";
import { calendarDate } from "../../src/lib/dates";
import { daysAgo, demoId, int } from "./lib";

/**
 * DEMO DATA — fictional Integral Academy team. All emails use the reserved
 * ".demo" domain and every id starts with "demo_".
 */
export interface SeedUser {
  key: string;
  name: string;
  email: string;
  jobTitle: string;
  role: RoleKey;
  department: "executive" | "finance" | "marketing" | "academic" | "technology" | "operations";
  employmentType: EmploymentType;
  startDate: Date;
  monthlyCost: number;
  phone: string;
  manager?: string;
}

export const SEED_USERS: SeedUser[] = [
  { key: "sipho", name: "Sipho Ndlovu", email: "sipho@integral.demo", jobTitle: "Founder & CEO", role: "SUPER_ADMIN", department: "executive", employmentType: "DIRECTOR", startDate: calendarDate(2025, 1, 1), monthlyCost: 38000, phone: "+27 82 555 0101" },
  { key: "michael", name: "Michael Naidoo", email: "michael@integral.demo", jobTitle: "Director: Strategy & Partnerships", role: "DIRECTOR", department: "executive", employmentType: "DIRECTOR", startDate: calendarDate(2025, 1, 1), monthlyCost: 34000, phone: "+27 83 555 0102", manager: "sipho" },
  { key: "lerato", name: "Lerato Mokoena", email: "lerato@integral.demo", jobTitle: "Director: Operations", role: "DIRECTOR", department: "operations", employmentType: "DIRECTOR", startDate: calendarDate(2025, 1, 1), monthlyCost: 34000, phone: "+27 72 555 0103", manager: "sipho" },
  { key: "ayesha", name: "Ayesha Patel", email: "ayesha@integral.demo", jobTitle: "Finance Executive", role: "FINANCE_EXECUTIVE", department: "finance", employmentType: "EMPLOYEE", startDate: calendarDate(2025, 3, 1), monthlyCost: 34000, phone: "+27 84 555 0104", manager: "lerato" },
  { key: "johan", name: "Johan van der Merwe", email: "johan@integral.demo", jobTitle: "Head of Marketing & Sales", role: "MARKETING_EXECUTIVE", department: "marketing", employmentType: "EMPLOYEE", startDate: calendarDate(2025, 2, 1), monthlyCost: 32000, phone: "+27 82 555 0105", manager: "michael" },
  { key: "nomvula", name: "Nomvula Khumalo", email: "nomvula@integral.demo", jobTitle: "Head Tutor", role: "HEAD_TUTOR", department: "academic", employmentType: "EMPLOYEE", startDate: calendarDate(2025, 1, 15), monthlyCost: 30000, phone: "+27 73 555 0106", manager: "lerato" },
  { key: "pieter", name: "Pieter Botha", email: "pieter@integral.demo", jobTitle: "Product Manager", role: "PRODUCT_MANAGER", department: "technology", employmentType: "EMPLOYEE", startDate: calendarDate(2025, 4, 1), monthlyCost: 36000, phone: "+27 76 555 0107", manager: "sipho" },
  { key: "kagiso", name: "Kagiso Molefe", email: "kagiso@integral.demo", jobTitle: "Senior Software Engineer", role: "DEVELOPER", department: "technology", employmentType: "EMPLOYEE", startDate: calendarDate(2025, 1, 15), monthlyCost: 36000, phone: "+27 81 555 0108", manager: "pieter" },
  { key: "ruan", name: "Ruan Pretorius", email: "ruan@integral.demo", jobTitle: "Full-stack Engineer", role: "DEVELOPER", department: "technology", employmentType: "EMPLOYEE", startDate: calendarDate(2025, 6, 1), monthlyCost: 27000, phone: "+27 79 555 0109", manager: "pieter" },
  { key: "zanele", name: "Zanele Dlamini", email: "zanele@integral.demo", jobTitle: "Mobile Engineer", role: "DEVELOPER", department: "technology", employmentType: "CONTRACTOR", startDate: calendarDate(2025, 9, 1), monthlyCost: 25000, phone: "+27 71 555 0110", manager: "pieter" },
  { key: "tshepo", name: "Tshepo Mabaso", email: "tshepo@integral.demo", jobTitle: "Marketing Coordinator", role: "MARKETING_STAFF", department: "marketing", employmentType: "EMPLOYEE", startDate: calendarDate(2025, 7, 1), monthlyCost: 15000, phone: "+27 63 555 0111", manager: "johan" },
  { key: "megan", name: "Megan Jacobs", email: "megan@integral.demo", jobTitle: "Content & Social Media Specialist", role: "MARKETING_STAFF", department: "marketing", employmentType: "EMPLOYEE", startDate: calendarDate(2025, 10, 1), monthlyCost: 14000, phone: "+27 64 555 0112", manager: "johan" },
  { key: "bongani", name: "Bongani Zulu", email: "bongani@integral.demo", jobTitle: "Mathematics Tutor (Grade 12)", role: "TUTOR", department: "academic", employmentType: "CONTRACTOR", startDate: calendarDate(2025, 1, 15), monthlyCost: 11000, phone: "+27 74 555 0113", manager: "nomvula" },
  { key: "fatima", name: "Fatima Adams", email: "fatima@integral.demo", jobTitle: "Mathematics Tutor (Grade 12)", role: "TUTOR", department: "academic", employmentType: "CONTRACTOR", startDate: calendarDate(2025, 3, 1), monthlyCost: 9500, phone: "+27 78 555 0114", manager: "nomvula" },
  { key: "lindiwe", name: "Lindiwe Nkosi", email: "lindiwe@integral.demo", jobTitle: "Mathematics Tutor (Grade 11)", role: "TUTOR", department: "academic", employmentType: "CONTRACTOR", startDate: calendarDate(2025, 8, 1), monthlyCost: 8000, phone: "+27 61 555 0115", manager: "nomvula" },
  { key: "werner", name: "Werner Steyn", email: "werner@integral.demo", jobTitle: "Physical Sciences Tutor", role: "TUTOR", department: "academic", employmentType: "CONTRACTOR", startDate: calendarDate(2026, 4, 1), monthlyCost: 7500, phone: "+27 82 555 0116", manager: "nomvula" },
  { key: "precious", name: "Precious Mthembu", email: "precious@integral.demo", jobTitle: "Mathematical Literacy Tutor", role: "TUTOR", department: "academic", employmentType: "CONTRACTOR", startDate: calendarDate(2025, 11, 1), monthlyCost: 6500, phone: "+27 66 555 0117", manager: "nomvula" },
];

export type UserIds = Record<string, string>;

export async function seedPeople(db: PrismaClient) {
  const password = process.env.SEED_DEMO_PASSWORD || "Integral!2026";
  const passwordHash = await hashPassword(password);
  const roles = new Map((await db.role.findMany()).map((r) => [r.key, r.id]));
  const departments = new Map((await db.department.findMany()).map((d) => [d.slug, d.id]));

  const ids: UserIds = {};
  for (const u of SEED_USERS) ids[u.key] = demoId("usr");

  await db.user.createMany({
    data: SEED_USERS.map((u) => ({
      id: ids[u.key],
      email: u.email,
      name: u.name,
      passwordHash,
      jobTitle: u.jobTitle,
      phone: u.phone,
      status: "ACTIVE" as const,
      employmentType: u.employmentType,
      startDate: u.startDate,
      monthlyCost: u.monthlyCost,
      roleId: roles.get(u.role)!,
      departmentId: departments.get(u.department)!,
      lastLoginAt: daysAgo(int(0, 3)),
    })),
  });
  for (const u of SEED_USERS) {
    if (u.manager) await db.user.update({ where: { id: ids[u.key] }, data: { managerId: ids[u.manager] } });
  }

  const tutorProfiles: Record<string, string> = {};
  const tutorSpecs: Record<string, [string, number, number]> = {
    nomvula: ["Grade 12 Mathematics · curriculum lead", 0, 10],
    bongani: ["Grade 12 Mathematics · Calculus & Functions", 350, 25],
    fatima: ["Grade 12 Mathematics · Euclidean Geometry & Trigonometry", 320, 22],
    lindiwe: ["Grade 11 Mathematics", 300, 18],
    werner: ["Grade 12 Physical Sciences", 340, 15],
    precious: ["Grade 12 Mathematical Literacy", 280, 12],
  };
  for (const [key, [specialisation, rate, capacity]] of Object.entries(tutorSpecs)) {
    tutorProfiles[key] = demoId("tut");
    await db.tutorProfile.create({
      data: {
        id: tutorProfiles[key],
        userId: ids[key],
        specialisation,
        hourlyRate: rate || null,
        weeklyCapacityHours: capacity,
        bio: `${SEED_USERS.find((u) => u.key === key)!.name.split(" ")[0]} has taught CAPS ${specialisation.split("·")[0].trim()} for several years.`,
      },
    });
  }

  return { userIds: ids, tutorProfiles, departments, password };
}
