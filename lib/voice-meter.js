/**
 * Mic helpers for voice input. SpeechRecognition owns the mic while listening —
 * holding a getUserMedia stream at the same time blocks recognition on desktop
 * and mobile. Warm up (acquire + immediate release) primes permission/iOS;
 * live level meters need a different STT path (MediaRecorder + server).
 */

/**
 * Brief getUserMedia then release — primes mic permission and helps iOS first
 * recognition without keeping a second capture session open.
 * @returns {Promise<boolean>} true when a stream was acquired and released
 */
export async function warmUpMicrophone() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}
