import { BaseUser } from "./user";

export interface Administrator extends BaseUser {
  role: "administrator";
}
