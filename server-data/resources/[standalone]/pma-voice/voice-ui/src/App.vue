<template>
	<body>
		<audio id="audio_on" src="mic_click_on.ogg"></audio>
		<audio id="audio_off" src="mic_click_off.ogg"></audio>
		<div v-if="voice.uiEnabled" class="voiceInfo">
			<p v-if="voice.callInfo !== 0" :class="{ talking: voice.talking }">
				[Call]
			</p>
			<p v-if="voice.radioEnabled && voice.radioChannel !== 0" :class="{ talking: voice.usingRadio }">
				{{ voice.radioChannel }} Mhz [Radio]
			</p>
			<p v-if="voice.voiceModes.length" :class="{ talking: voice.talking }">
				{{ voice.voiceModes[voice.voiceMode][1] }} [Range]
			</p>
		</div>
	</body>
</template>

<script>
import { reactive } from "vue";
export default {
	name: "App",
	setup() {
		const voice = reactive({
			uiEnabled: true,
			voiceModes: [],
			voiceMode: 0,
			radioChannel: 0,
			radioEnabled: true,
			usingRadio: false,
			callInfo: 0,
			talking: false,
		});

		// stops from toggling voice at the end of talking
		window.addEventListener("message", function(event) {
			const data = event.data;

			if (data.uiEnabled !== undefined) {
				voice.uiEnabled = data.uiEnabled
			}

			if (data.voiceModes !== undefined) {
				voice.voiceModes = JSON.parse(data.voiceModes);
				// Push our own custom type for modes that have their range changed
				let voiceModes = [...voice.voiceModes]
				voiceModes.push([0.0, "Custom"])
				voice.voiceModes = voiceModes
			}

			if (data.voiceMode !== undefined) {
				voice.voiceMode = data.voiceMode;
			}

			if (data.radioChannel !== undefined) {
				voice.radioChannel = data.radioChannel;
			}

			if (data.radioEnabled !== undefined) {
				voice.radioEnabled = data.radioEnabled;
			}

			if (data.callInfo !== undefined) {
				voice.callInfo = data.callInfo;
			}

			if (data.usingRadio !== undefined && data.usingRadio !== voice.usingRadio) {
				voice.usingRadio = data.usingRadio;
			}
			
			if ((data.talking !== undefined) && !voice.usingRadio) {
				voice.talking = data.talking;
			}

			if (data.sound && voice.radioEnabled && voice.radioChannel !== 0) {
				let click = document.getElementById(data.sound);
				// discard these errors as its usually just a 'uncaught promise' from two clicks happening too fast.
				click.load();
				click.volume = data.volume;
				click.play().catch((e) => {});
			}
		});

		fetch(`https://${GetParentResourceName()}/uiReady`, { method: 'POST' });

		return { voice };
	}
};
</script>

<style>
.voiceInfo {
	font-family: "Segoe UI", Arial, sans-serif;
	position: fixed;
	text-align: right;
	bottom: 7px;
	padding: 0;
	right: 8px;
	font-size: 10px;
	line-height: 1.35;
	font-weight: 600;
	color: rgba(210, 218, 223, .66);
	background: transparent;
	text-shadow: 0 1px 2px rgba(0, 0, 0, .9);
}
.talking {
	color: rgba(255, 255, 255, .92);
}
p {
	margin: 0;
}
</style>
