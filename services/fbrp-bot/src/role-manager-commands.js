import { SlashCommandBuilder } from "discord.js";

const managedRole = (option) =>
  option.setName("role").setDescription("Role to manage").setRequired(true);
const managedMember = (option, description = "Discord member") =>
  option.setName("member").setDescription(description).setRequired(true);

const builders = [
  new SlashCommandBuilder()
    .setName("addrole")
    .setDescription("Give a member a role you manage")
    .addUserOption((o) => managedMember(o, "Member receiving the role"))
    .addRoleOption(managedRole),
  new SlashCommandBuilder()
    .setName("removerole")
    .setDescription("Remove a role you manage from a member")
    .addUserOption((o) => managedMember(o, "Member losing the role"))
    .addRoleOption(managedRole),
  new SlashCommandBuilder()
    .setName("wiperole")
    .setDescription("Remove a role you manage from every member")
    .addRoleOption(managedRole),
  new SlashCommandBuilder()
    .setName("useradd")
    .setDescription("Add a manager to one of your roles")
    .addUserOption((o) => managedMember(o, "New role manager"))
    .addRoleOption(managedRole),
  new SlashCommandBuilder()
    .setName("setowner")
    .setDescription("Set or transfer the owner of a managed role")
    .addUserOption((o) => managedMember(o, "New role owner"))
    .addRoleOption(managedRole),
  new SlashCommandBuilder()
    .setName("userdel")
    .setDescription("Remove a manager from one of your roles")
    .addUserOption((o) => managedMember(o, "Role manager to remove"))
    .addRoleOption(managedRole),
  new SlashCommandBuilder()
    .setName("mgrwipe")
    .setDescription("Remove every manager from one of your roles")
    .addRoleOption(managedRole),
];

export const roleManagerCommands = builders.map((command) => command.toJSON());
export const roleManagerCommandNames = new Set(roleManagerCommands.map((command) => command.name));
