import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../src/entities/user.entity";
import { Connection } from "../src/entities/connection.entity";

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const userRepo: Repository<User> = app.get(getRepositoryToken(User));
  const connectionRepo: Repository<Connection> = app.get(
    getRepositoryToken(Connection),
  );

  // Clean existing test users (cascades to connections via FK)
  await userRepo.delete({ firebase_uid: "test-user1" });
  await userRepo.delete({ firebase_uid: "test-user2" });
  await userRepo.delete({ firebase_uid: "test-user3" });

  // User 1 — premium
  const user1 = await userRepo.save({
    firebase_uid: "test-user1",
    email: "user1@test.dev",
    first_name: "Alice",
    last_name: "Premium",
    premium_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  // User 2 — free
  const user2 = await userRepo.save({
    firebase_uid: "test-user2",
    email: "user2@test.dev",
    first_name: "Bob",
    last_name: "Free",
    premium_until: null,
  });

  // User 3 — free
  const user3 = await userRepo.save({
    firebase_uid: "test-user3",
    email: "user3@test.dev",
    first_name: "Carol",
    last_name: "Free",
    premium_until: null,
  });

  // Helper: create a normalized connection pair (user_id < friend_id alphabetically)
  function createConnection(
    idA: string,
    idB: string,
    aShowsStatus: boolean,
    bShowsStatus: boolean,
  ) {
    const [userId, friendId] =
      idA < idB ? [idA, idB] : [idB, idA];
    const [aShows, bShows] =
      idA < idB
        ? [aShowsStatus, bShowsStatus]
        : [bShowsStatus, aShowsStatus];

    return connectionRepo.save({
      user_id: userId,
      friend_id: friendId,
      a_shows_status: aShows,
      b_shows_status: bShows,
    });
  }

  // Alice <-> Bob connected, both visible
  await createConnection(user1.id, user2.id, true, true);

  // Bob <-> Carol connected, both visible
  await createConnection(user2.id, user3.id, true, true);

  // Alice <-> Carol connected, Alice hidden from Carol
  await createConnection(user1.id, user3.id, false, true);

  console.log("\n✅ Test data seeded\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TOKEN                    USER     PLAN");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`dev-test-test-user1      Alice    Premium`);
  console.log(`dev-test-test-user2      Bob      Free`);
  console.log(`dev-test-test-user3      Carol    Free`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("Connections:");
  console.log("  Alice ↔ Bob    (both visible)");
  console.log("  Bob   ↔ Carol  (both visible)");
  console.log("  Alice ↔ Carol  (Alice hidden from Carol)\n");

  await app.close();
}

seed().catch(console.error);
