import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../src/entities/user.entity";
import { getFirebaseAdmin } from "../src/config/firebase-admin.config";

const USERS = [
  { email: "emma.wilson@instantstatus.app", password: "TestUser123!", firstName: "Emma", lastName: "Wilson" },
  { email: "james.chen@instantstatus.app", password: "TestUser123!", firstName: "James", lastName: "Chen" },
  { email: "sofia.rodriguez@instantstatus.app", password: "TestUser123!", firstName: "Sofia", lastName: "Rodriguez" },
  { email: "liam.patel@instantstatus.app", password: "TestUser123!", firstName: "Liam", lastName: "Patel" },
  { email: "olivia.kim@instantstatus.app", password: "TestUser123!", firstName: "Olivia", lastName: "Kim" },
];

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const userRepo: Repository<User> = app.get(getRepositoryToken(User));
  const firebaseAdmin = getFirebaseAdmin();
  const auth = firebaseAdmin.auth();

  console.log("\nSeeding 5 real users...\n");

  for (const u of USERS) {
    // Create or get Firebase Auth user
    let firebaseUser;
    try {
      firebaseUser = await auth.getUserByEmail(u.email);
      console.log(`  Firebase: ${u.email} already exists (${firebaseUser.uid})`);
    } catch {
      firebaseUser = await auth.createUser({
        email: u.email,
        password: u.password,
        emailVerified: true,
        displayName: `${u.firstName} ${u.lastName}`,
      });
      console.log(`  Firebase: created ${u.email} (${firebaseUser.uid})`);
    }

    // Upsert into database
    const existing = await userRepo.findOne({ where: { firebase_uid: firebaseUser.uid } });
    if (existing) {
      console.log(`  DB: ${u.email} already exists`);
    } else {
      await userRepo.save({
        firebase_uid: firebaseUser.uid,
        email: u.email,
        first_name: u.firstName,
        last_name: u.lastName,
        premium_until: null,
      });
      console.log(`  DB: created ${u.email}`);
    }
  }

  console.log("\n✅ Done! All users can sign in with password: TestUser123!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("EMAIL                                    NAME");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const u of USERS) {
    console.log(`${u.email.padEnd(40)} ${u.firstName} ${u.lastName}`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  await app.close();
}

seed().catch(console.error);
