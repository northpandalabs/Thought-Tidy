// Prompt definitions and profile injection — pure JS, no browser dependencies

const MENU_PROMPTS = {
  "fix-spelling":   "Fix all spelling and grammar mistakes in the following text. Return ONLY the corrected text with no explanation or commentary:",
  "sound-like-me":  "Rewrite the following text so it sounds exactly like this specific person wrote it themselves — authentic to their voice, their patterns, their personality. Clean it up, fix spelling and grammar, but keep it unmistakably theirs. Do not make it sound generic or AI-written. Return ONLY the rewritten text:",
  "professional":   "Rewrite the following text so it is professional, grammatically flawless, and clearly well-spoken. Ensure the full intended meaning and context is preserved completely — do not drop any key information or nuance. The result should sound like it was written by a confident, articulate professional. Return ONLY the rewritten text:",
  "sound-human":    "Take the following text and make it sound like a real, articulate human wrote it. Fix all spelling and grammar. Keep the authentic voice — not robotic, not stiff, not overly formal. It should sound natural and genuine, like someone speaking clearly and confidently. Return ONLY the rewritten text:",
  "brain-dump":     "The following is a raw brain dump — scattered thoughts, possibly poor spelling, fragments, maybe repetitive. Your job: extract every idea, organize the thoughts logically, fix all spelling and grammar, and turn it into clear, readable text that says exactly what the person was trying to say. Do not lose a single piece of information. Return ONLY the clean result:",
  "improve":        "Improve the writing quality, clarity, and flow of the following text while preserving the original meaning and voice. Return ONLY the improved text:",
  "formal":         "Rewrite the following text in a more formal tone. Return ONLY the rewritten text:",
  "casual":         "Rewrite the following text in a more casual, friendly, conversational tone. Return ONLY the rewritten text:",
  "shorten":        "Shorten the following text while keeping every key point. Return ONLY the shortened text:",
  "expand":         "Expand the following text with more detail, context, and explanation. Return ONLY the expanded text:"
};

/**
 * Prepends user profile context to a base prompt when profileEnabled is true
 * and at least one profile field is filled in.
 * @param {string} basePrompt
 * @param {object} s - settings object from storage
 * @returns {string}
 */
function buildPromptWithProfile(basePrompt, s) {
  if (!s || !s.profileEnabled) return basePrompt;

  const parts = [];
  if (s.profileName)    parts.push(`Name: ${s.profileName}`);
  if (s.profileRole)    parts.push(`Role: ${s.profileRole}`);
  if (s.profileStyle)   parts.push(`Writing style & preferences: ${s.profileStyle}`);
  if (s.profileContext) parts.push(`Personal context:\n${s.profileContext}`);

  if (!parts.length) return basePrompt;

  return (
    `You are assisting a specific person. Here is their profile — use it to make your output feel authentic and personal to them:\n\n` +
    parts.join("\n") +
    `\n\n---\n\n` +
    basePrompt
  );
}

if (typeof module !== "undefined") {
  module.exports = { MENU_PROMPTS, buildPromptWithProfile };
}
