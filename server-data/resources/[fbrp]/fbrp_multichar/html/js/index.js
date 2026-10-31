const store = Vuex.createStore({
  state: {},
  mutations: {},
  actions: {},
});

let audioPlayer = null;

// "#RRGGBB" or "#RGB" only, so nothing else ends up in a style attribute
function okColour(value) {
  const v = String(value || "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : "";
}

const app = Vue.createApp({
  data: () => ({
    show: false,
    registerPage: false,
    charactersData: "",
    animleftContainer: false,
    currentCharacterData: false,
    slotNumber: 0,
    tebexSlotPopup: false,
    selectedPopup: [],
    steamName: "",
    steamProfile: "",
    steamID: "",
    nameValue: "",
    surnameValue: "",
    birthdayValue: null,
    heightValue: "",
    genderValue: "",
    nationalityValue: "",
    cid: 0,
    currentCid: "",
    selectedCid: "",
    tbxID: "",
    viewedCharacters: [],
    viewedCharacters2: [],
    deletePopup: false,
    dataLoaded: false,
    isError: false,
    errorMessage: "",
    forbiddenSymbols: [
      "!",
      "@",
      "#",
      "$",
      "%",
      "^",
      "&",
      "*",
      "(",
      ")",
      "+",
      "=",
    ],
    displayMessage: "",
    Locales: "",
    dateFormat: "",
    serverLogo: "",
    CanDelete: null,
    isError: false,
    loadingContainer: false,
    editingId: null,
    spawnPage: false,
    spawnData: { character: "", spawns: [] },
    selectedSpawn: null,
    spawning: false,
    submitting: false,
    prio: null,
    prioClock: "",
  }),

  methods: {
    // ---- AOP & priority panel (same text and colours as the HUD panel in fbrp_core) ----
    prioText(key, fallback) {
      const t = (this.prio && this.prio.text) || {};
      return t[key] || fallback;
    },
    prioStatus(z) {
      if (z.status === "active") return { text: this.prioText("InProgress", "In Progress"), cls: "in-progress" };
      if (z.status === "hold") return { text: this.prioText("OnHold", "On Hold"), cls: "on-hold" };
      if (z.status === "cooldown" && Number(z.remaining) > 0) return { text: `${Math.ceil(Number(z.remaining))}${this.prioText("MinutesSuffix", "m")}`, cls: "cooldown" };
      return { text: this.prioText("Available", "Available"), cls: "available" };
    },
    tagLabel(tag) {
      if (!tag) return "";
      return typeof tag === "object" ? tag.label || "" : String(tag);
    },
    tagStyle(tag) {
      const c = tag && typeof tag === "object" && okColour(tag.color);
      return c ? { color: c } : {};
    },
    tickPrioClock() {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      this.prioClock = `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    },
    playClickSound() {
      clicksound("click.mp3");
    },
    onNumericInput() {
      this.numericValue = this.numericValue.replace(/[^0-9]/g, "");
    },
    shouldShowCharacter(slotId) {
      return (
        !this.viewedCharacters.includes(slotId) &&
        this.getCharacter(slotId, true)
      );
    },
    getCharacter(slotId, bool) {
      const character = this.charactersData.find(
        (info) => parseInt(info.identifier[4]) === slotId
      );

      if (character) {
        return bool ? character : character.job;
      }
      return null;
    },
    handleCharacterClick(slotId) {
      const character = this.getCharacter(slotId, true);
      if (character) {
        this.currentCharacterDataValue(character, slotId);
        this.viewedCharacters.push(slotId);
      }
    },
    setGender(value) {
      this.genderValue = value;
    },
    joinGame() {
      postNUI("Play", {
        charData: this.currentCharacterData,
      });
      this.show = false;
      this.currentCharacterData = false;
      this.selectedPopup = {};
    },
    checkData() {
      if (this.dataLoaded == false) {
        postNUI("loadagain");
        this.dataLoaded = true;
      }
    },
    openRegister(slot, tebexSlot) {
      if (!this.loadingContainer) {
        this.selectedCid = slot;

        if (tebexSlot) {
          this.currentCharacterData = false;
          this.selectedPopup = {};
          this.tebexSlotPopup = true;
          this.registerPage = false;
        } else {
          (this.show = false), (this.registerPage = true);
          this.currentCharacterData = false;
          this.selectedPopup = {};
          postNUI("SetAnimations", {
            toggle: false,
          });
        }
        postNUI("ChangeCam", {});
      }
    },
    openEdit() {
      const c = this.currentCharacterData;
      if (!c) return;
      this.editingId = c.id;
      this.nameValue = c.firstname || "";
      this.surnameValue = c.lastname || "";
      this.nationalityValue = String(c.nationality || "").toLowerCase();
      this.birthdayValue = c.dateofbirth || null;
      this.heightValue = c.height || "";
      this.genderValue = String(c.sex).toLowerCase() === "female" ? 1 : 0;
      this.displayMessage = "";
      this.isError = false;
      this.show = false;
      this.registerPage = true;
      postNUI("ChangeCam", {});
    },
    clearForm() {
      this.nameValue = "";
      this.surnameValue = "";
      this.heightValue = "";
      this.genderValue = "";
      this.nationalityValue = "";
      this.birthdayValue = "";
      this.displayMessage = "";
      this.isError = false;
      this.editingId = null;
    },
    pickSpawn(spawn) {
      if (this.spawning) return;
      this.selectedSpawn = spawn;
      postNUI("PreviewSpawn", { x: spawn.x, y: spawn.y, z: spawn.z, h: spawn.h });
    },
    confirmSpawn() {
      if (!this.selectedSpawn || this.spawning) return;
      this.spawning = true;
      postNUI("ConfirmSpawn", this.selectedSpawn);
    },
    checkTebex() {
      postNUI("checkTebex", {
        tbxid: this.tbxID,
        slotno: this.selectedCid,
      });
    },
    createCharacter() {
      for (const value of [this.nameValue, this.surnameValue]) {
        if (!value || value.trim() === "") {
          this.displayMessage = this.Locales["registerError"];
          this.isError = false;
          return;
        }

        for (const symbol of this.forbiddenSymbols) {
          if (value.includes(symbol)) {
            this.displayMessage = this.Locales["registerError"];
            this.isError = false;
            return;
          }
        }
      }

      if (
        this.genderValue.toString() !== "0" &&
        this.genderValue.toString() !== "1"
      ) {
        this.displayMessage = this.Locales["registerError"];
        this.isError = false;
        return;
      }

      const namePattern = /^[A-Za-z][A-Za-z '\-]+$/;
      const fail = (message) => {
        this.displayMessage = message || this.Locales["registerError"];
        this.isError = false;
      };
      if (
        !namePattern.test(this.nameValue.trim()) ||
        !namePattern.test(this.surnameValue.trim())
      ) {
        fail("Names can only use letters, spaces, - and '.");
        return;
      }
      const height = this.heightValue === "" ? null : Number(this.heightValue);
      if (height !== null && (!(height >= 120) || !(height <= 230))) {
        fail("Height must be between 120 and 230 cm.");
        return;
      }
      const birthday = String(this.birthdayValue || "");
      const parts = birthday.split("-").map(Number);
      const birthDate = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
      if (
        parts.length !== 3 ||
        isNaN(birthDate.getTime()) ||
        birthDate.getMonth() !== parts[1] - 1 ||
        parts[0] < 1900 ||
        birthDate > new Date()
      ) {
        fail("Enter a valid birthdate.");
        return;
      }
      this.displayMessage = this.Locales["registerVerify"];
      this.isError = true;
      this.charactersData.id += 1;
      // The form stays filled in until the server confirms: a refusal sends it back.
      this.submitting = true;
      postNUI(this.editingId ? "editChar" : "createChar", {
        id: this.editingId,
        firstname: this.nameValue.trim(),
        lastname: this.surnameValue.trim(),
        nationality: this.nationalityValue,
        dateofbirth: this.birthdayValue,
        height: this.heightValue,
        gender: this.genderValue,
        cid: this.selectedCid,
      });
    },
    openDeletePopUp() {
      if (this.CanDelete) {
        this.deletePopup = true;
      }
    },
    cancelCreate() {
      if (this.registerPage) {
        this.registerPage = false;
        this.show = true;
        this.clearForm();
        this.currentCharacterData = false;
      } else if (this.tebexSlotPopup) {
        this.tebexSlotPopup = false;
        this.show = true;
        this.tbxID = "";
      }
    },
    cancelDelete() {
      this.deletePopup = false;
    },
    deleteCharacter() {
      const charactersDatas = this.charactersData.find(
        (item) => item.identifier == this.currentCharacterData.identifier
      );
      postNUI("DeleteCharacter", {
        charid: parseInt(this.currentCharacterData.identifier[4]),
        identifier: this.currentCharacterData.identifier,
      });
      this.charactersData.splice(
        this.charactersData.indexOf(charactersDatas),
        1
      );
      this.currentCharacterData = false;
      this.deletePopup = false;
    },
    handleKeyUp: function (e) {
      if (e.key == "Escape") {
        this.cancelCreate();
      }
    },
    currentCharacterDataValue(val, slotNumber, bool) {
      if (!this.loadingContainer) {
        const character = this.getCharacter(val, true);

        if (character && !this.viewedCharacters.includes(val)) {
          this.viewedCharacters.push(val);
        }

        if (val === this.currentCharacterData) {
          this.currentCharacterData = false;
          this.selectedPopup = {};
        } else {
          this.currentCharacterData = val;
          this.selectedPopup = {};
          this.selectedPopup[slotNumber] = true;

          postNUI("SetAnimations", {
            charData: this.currentCharacterData,
            toggle: true,
          });
        }

        if (bool && !val === this.currentCharacterData) {
          postNUI("ChangeCam", {});
          this.currentCharacterData = false;
          this.selectedPopup = {};
        }
      }
    },
  },
  computed: {
    prioServerName() {
      if (!this.prio) return "";
      return (this.prio.server || "") + (this.prio.lobby ? ` (${this.prio.lobby})` : "");
    },
    prioStyle() {
      const p = this.prio || {};
      const c = p.colours || {};
      const primary = okColour(p.colour) || "#D6DA1E";
      return {
        "--p-primary": primary,
        "--p-size": `${Math.min(30, Math.max(10, Number(p.size) || 16))}px`,
        "--p-server": okColour(c.ServerName) || primary,
        "--p-time": okColour(c.Time) || primary,
        "--p-aop": okColour(c.AOPValue) || "#FFFFFF",
        "--p-tag": okColour(c.TagValue) || "#FFFFFF",
        "--p-available": okColour(c.Available) || "#90EE90",
        "--p-cooldown": okColour(c.Cooldown) || "#FFFFFF",
        "--p-progress": okColour(c.InProgress) || "#FFA500",
        "--p-hold": okColour(c.OnHold) || "#FF3B3B",
        "--p-pt": okColour(c.Peacetime) || "#32CD32",
        "--p-na": okColour(c.NotAvailable) || "#FF3B3B",
      };
    },
    allowedCount() {
      return (this.spawnData.spawns || []).filter((s) => s.allowed !== false).length;
    },
    selectedBlocked() {
      return !!(this.selectedSpawn && this.selectedSpawn.allowed === false);
    },
    formattedAge() {
      const separators = ["-", "/", " "];
      let separator = null;

      for (const sep of separators) {
        if (this.currentCharacterData.dateofbirth.includes(sep)) {
          separator = sep;
          break;
        }
      }

      if (!separator) {
        console.error("Invalid date format");
        return "";
      }

      const birthdateArr =
        this.currentCharacterData.dateofbirth.split(separator);
      let day, month, year;

      if (birthdateArr[0].length === 4) {
        year = birthdateArr[0];
        month = birthdateArr[1] - 1;
        day = birthdateArr[2];
      } else {
        day = birthdateArr[0];
        month = birthdateArr[1] - 1;
        year = birthdateArr[2];
      }

      const birthdateObj = new Date(year, month, day);
      const now = new Date();

      const ageInMilliseconds = now - birthdateObj;
      const ageInYears = ageInMilliseconds / (365 * 24 * 60 * 60 * 1000);

      const formattedBirthdate = birthdateObj.toLocaleDateString(
        this.dateFormat,
        {
          day: "numeric",
          month: "long",
          year: "numeric",
        }
      );

      this.age = formattedBirthdate;

      return `${Math.floor(ageInYears)} · ${formattedBirthdate}`;
    },
  },

  watch: {},

  beforeDestroy() {},
  mounted() {
    this.tickPrioClock();
    setInterval(() => this.tickPrioClock(), 5000);
    window.addEventListener("load", (event) => {
      this.checkData();
    });
    window.addEventListener("keyup", this.keyHandler);
    window.addEventListener("message", (event) => {
      switch (event.data.message) {

        case "CHECK_NUI":
          postNUI("loaded", true);
        break;
        case "SetChars":
          this.loadingContainer = false;
          this.submitting = false;
          this.viewedCharacters = [];
          this.registerPage = false;
          this.spawnPage = false;
          this.editingId = null;
          this.show = true;
          this.nameValue = "";
          this.surnameValue = "";
          this.heightValue = "";
          this.genderValue = "";
          this.nationalityValue = "";
          this.birthdayValue = "";
          this.currentCid = event.data.charData.length;
          this.charactersData = event.data.charData;
          this.Locales = event.data.Locales;
          this.slotNumber = event.data.Slots;
          this.CanDelete = event.data.CanDelete;
          this.serverLogo = event.data.serverLogo;
          this.dateFormat = event.data.dateFormat;
          this.show = true;
        break;
        case "SetSpawns":
          this.spawnData = event.data.data;
          this.selectedSpawn = null;
          this.spawning = false;
          this.show = false;
          this.registerPage = false;
          this.spawnPage = true;
        break;
        case "FormError":
          // The server refused the create/edit: show the reason on the form.
          this.submitting = false;
          this.show = false;
          this.registerPage = true;
          this.displayMessage = event.data.text || this.Locales["registerError"];
          this.isError = false;
        break;
        case "SetPrio":
          this.prio = event.data.data || null;
        break;
        case "UpdateSpawns": {
          // AOP changed while picking: new allowed marks, keep what they had selected
          const keep = this.selectedSpawn && this.selectedSpawn.id;
          this.spawnData = event.data.data;
          this.selectedSpawn = (this.spawnData.spawns || []).find((s) => String(s.id) === String(keep)) || null;
        }
        break;
        case "SpawnFailed":
          this.spawning = false;
        break;
        case "SetSteamInfos":
          this.steamName = event.data.name;
          this.steamProfile = event.data.profilephoto;
          this.steamID = event.data.id;
        break;
        case "Hide":
          // Added for Florida Bay: the Lua bridge hides the screen when the
          // spawn selector takes over.
          this.show = false;
          this.registerPage = false;
          this.spawnPage = false;
          this.spawning = false;
          this.tebexSlotPopup = false;
          this.deletePopup = false;
          this.currentCharacterData = false;
          this.selectedPopup = {};
        break;
        case "UnlockTebexSlot":
          this.unlockTebex = event.data.slotno;
          this.tebexSlotPopup = false;
          this.slotNumber.forEach((item) => {
            if (item.id === this.unlockTebex) {
              item.tebex = false;
            }
          });
        break;
          default:
            break;
      }
    });
    setTimeout(() => {
      this.animleftContainer = true;
    }, 2000);
    window.addEventListener("keyup", this.handleKeyUp);
  },

  destroyed() {
    window.removeEventListener("keyup", this.handleKeyUp);
  },
});

app.use(store).mount("#app");

const resourceName = window.GetParentResourceName
  ? window.GetParentResourceName()
  : "mMulticharacter";

window.postNUI = async (name, data) => {
  try {
    const response = await fetch(`https://${resourceName}/${name}`, {
      method: "POST",
      mode: "cors",
      cache: "no-cache",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      redirect: "follow",
      referrerPolicy: "no-referrer",
      body: JSON.stringify(data),
    });
    return !response.ok ? null : response.json();
  } catch (error) {
    // console.log(error)
  }
};

function clicksound(val) {
  let audioPath = `./${val}`;
  
  if (audioPlayer && audioPlayer.playing()) {
      audioPlayer.stop();
  } else {
      audioPlayer = new Howl({
          src: [audioPath]
      });
      audioPlayer.volume(0.4);
      audioPlayer.play();
  }
}