import { SlashCommandBuilder } from "discord.js";

/** Slash commands of the FBRP Personals bot (moved off the main Florida Bay Network bot). */

const personalVehicle = (o) =>
  o.setName("vehicle").setDescription("Personal vehicle").setRequired(true).setAutocomplete(true);

export const personal = new SlashCommandBuilder()
  .setName("personal")
  .setDescription("Personal vehicles: cars only their owner and trusted people can spawn and drive")
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Management: make a vehicle model someone's personal")
      .addStringOption((o) =>
        o.setName("model").setDescription("Spawn name of the vehicle, e.g. sultanrs").setRequired(true).setMaxLength(40),
      )
      .addUserOption((o) => o.setName("owner").setDescription("Who owns it").setRequired(true))
      .addStringOption((o) => o.setName("label").setDescription("Name shown in the F7 garage").setMaxLength(60))
      .addStringOption((o) => o.setName("plate").setDescription("Custom plate, up to 8 characters").setMaxLength(8))
      .addBooleanOption((o) => o.setName("bulletproof").setDescription("Bullets cannot break the glass or hit anyone inside, and nobody inside can shoot out")),
  )
  .addSubcommand((s) =>
    s
      .setName("edit")
      .setDescription("Management: change a personal's name, model, plate or availability")
      .addStringOption(personalVehicle)
      .addStringOption((o) => o.setName("label").setDescription("Name shown in the F7 garage").setMaxLength(60))
      .addStringOption((o) => o.setName("model").setDescription("Spawn name of the vehicle").setMaxLength(40))
      .addStringOption((o) => o.setName("plate").setDescription("Plate, up to 8 characters; \"-\" resets it").setMaxLength(8))
      .addBooleanOption((o) => o.setName("enabled").setDescription("Turn the vehicle on or off"))
      .addBooleanOption((o) => o.setName("bulletproof").setDescription("Bulletproof glass and occupants, no shooting out")),
  )
  .addSubcommand((s) =>
    s
      .setName("owner")
      .setDescription("Management: transfer a personal to someone else")
      .addStringOption(personalVehicle)
      .addUserOption((o) => o.setName("member").setDescription("New owner").setRequired(true)),
  )
  .addSubcommand((s) =>
    s.setName("remove").setDescription("Management: delete a personal vehicle").addStringOption(personalVehicle),
  )
  .addSubcommand((s) =>
    s
      .setName("trust")
      .setDescription("Let someone spawn and drive a personal (up to 3 people)")
      .addStringOption(personalVehicle)
      .addUserOption((o) => o.setName("member").setDescription("Who to trust").setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("untrust")
      .setDescription("Remove someone from a personal's trust list")
      .addStringOption(personalVehicle)
      .addUserOption((o) => o.setName("member").setDescription("Who to remove").setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("locktag")
      .setDescription("Lock a personal to a tag so everyone holding the tag can use it")
      .addStringOption(personalVehicle)
      .addStringOption((o) => o.setName("tag").setDescription("Headtag or gang tag").setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("unlocktag")
      .setDescription("Remove a tag lock from a personal")
      .addStringOption(personalVehicle)
      .addStringOption((o) => o.setName("tag").setDescription("Tag to remove").setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((s) =>
    s.setName("info").setDescription("Show one personal vehicle").addStringOption(personalVehicle),
  )
  .addSubcommand((s) =>
    s
      .setName("list")
      .setDescription("List your personal vehicles (management can look up anyone or list them all)")
      .addUserOption((o) => o.setName("member").setDescription("Management: whose vehicles to show"))
      .addBooleanOption((o) => o.setName("all").setDescription("Management: show every personal vehicle")),
  );

export const personalsCommands = [personal].map((command) => command.toJSON());
export const personalsCommandNames = new Set(personalsCommands.map((command) => command.name));
