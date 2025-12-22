import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as admin from "firebase-admin";
import { UserService } from "../user/user.service";
import { getFirebaseAdmin } from "../config/firebase-admin.config";

@Injectable()
export class AuthService {
  private firebaseAdmin: admin.app.App;

  constructor(private userService: UserService) {
    this.firebaseAdmin = getFirebaseAdmin();
  }

  async verifyFirebaseToken(
    idToken: string
  ): Promise<admin.auth.DecodedIdToken> {
    try {
      const decodedToken = await this.firebaseAdmin
        .auth()
        .verifyIdToken(idToken);
      return decodedToken;
    } catch (error) {
      console.error(error);
      throw new UnauthorizedException("Invalid Firebase token");
    }
  }

  async getOrCreateUser(uid: string, email?: string | null) {
    let user = await this.userService.findByFirebaseUid(uid);

    if (!user) {
      user = await this.userService.create({
        firebase_uid: uid,
        email: email || null,
        first_name: null,
        last_name: null,
      });
    } else if (email && !user.email) {
      // Update email if it wasn't set before
      user.email = email;
      user = await this.userService.update(user.id, { email });
    }

    return user;
  }
}
