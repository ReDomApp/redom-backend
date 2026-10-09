# Cartoon—R8.0 Animation Intelligence: Implementation Contract

## Scope and honesty
Cartoon—R8.0 is an isolated animation product/runtime. The current worker implementation is based on the Wan2.2 TI2V-5B architecture. Animation-specific prompting, continuity conditioning, checkpoint validation, model/runtime isolation and Movie Studio finishing are implemented in this branch; this does **not** prove that a separately trained Cartoon checkpoint has been provisioned, that the GPU endpoint is deployed, or that outputs meet feature-animation quality. A compatible, licensed, animation-tuned checkpoint and real render evidence remain required before the product can be described as production-ready.

## Runtime identity and routing
- Public model: `Cartoon—R8.0`; runtime: `redom-cartoon-r8-native`.
- The backend routes `format: "cartoon"` short jobs to `REDOM_CARTOON_ENGINE_URL/TOKEN`, never silently to the Video endpoint.
- Movie Studio routes animated episode shots to Cartoon—R8.0 and sends final composition to `Studio—Ultron 8.0R` using the Studio endpoint and token.
- Worker startup rejects mismatched model/runtime IDs and disallowed formats.
- `/health` must report checkpoint/GPU readiness accurately. An existing directory alone does not certify checkpoint provenance or quality.
- The Cartoon endpoint must use its own provisioned checkpoint directory, endpoint credentials and Redis queue. Do not share the Video checkpoint merely by renaming the model ID. The currently supported worker architecture must be compatible with the mounted weights.

## Animation-directed generation
Every Cartoon shot must specify and preserve:
- Medium: 2D, stylized 3D, anime, cel-shaded, painterly or intentional hybrid.
- Recurring human, animal and creature model sheets: silhouette, face/eyes, proportions, palette, hair/fur/feathers/scales/markings, costume, accessories, age impression, scale, gait and invariants.
- Acting and motion: readable posing, anticipation, arcs, weight, contacts, foot/paw planting, overlap/follow-through, secondary action, expression holds and species-specific locomotion.
- Camera and world: geography, eye-lines, screen direction, lighting, layered background movement, depth and palette continuity.
- Temporal failure constraints: reduce morphing, anatomy drift, flicker, texture crawl, extra limbs, identity changes and foot sliding.
- Language: spoken language, locale/dialect, register, emotion, pace, pauses and pronunciation. Actual speech and lip-sync are claimed only when the configured audio/lip-sync pipeline generated and validated them.

## Internet-grounded art direction
When a creator names an anime, studio or reference:
1. Research public sources for high-level visual grammar (composition, shape language, palette, effects, timing, tone and animation technique).
2. Record source URLs and distinguish verified facts from interpretation.
3. Convert findings into an original style brief suitable for the story and available renderer.
4. Do not reproduce protected characters, exact frames, signature costumes, logos, scripts, lyrics or scene sequences without appropriate rights.
5. If web research is unavailable, say so and request a style description or proceed with clearly labelled general direction.

## Movie Studio finishing pass
For animated projects, Studio—Ultron 8.0R is responsible for final assembly: edit rhythm, shot ordering, transitions, color continuity, soundtrack/dialogue mix, captions and narrative flow. It must preserve the approved Cartoon designs, not redesign characters or turn the project into live action. The present worker's `compose` operation performs media assembly/post-processing; it is not a second generative animation pass. Any generative Studio enhancement must be explicitly implemented and acceptance-tested before it is advertised.

## Twelve required acceptance tests
1. **Human identity continuity:** a recurring human character keeps face, proportions, hair, clothing and palette across at least 3 shots.
2. **Animal anatomy and gait:** one animal maintains correct species traits, limb count, gait, markings and body proportions.
3. **Multi-character scene:** at least 3 characters maintain distinct silhouettes, scale and identities without merging.
4. **Animation-medium fidelity:** a requested anime/2D/3D/cel-shaded style remains consistent across shots.
5. **Movement and contact:** run/jump/object interaction shows coherent contact, weight, arcs and follow-through without visible foot sliding.
6. **Facial performance:** requested emotional beats produce readable expression changes without face identity drift.
7. **Multilingual dialogue:** at least two non-English test languages preserve intended dialogue language and localized captions.
8. **Dialect and speaking style:** locale, delivery, pace, pronunciation notes and speaker assignment survive the plan-to-audio handoff.
9. **Lip-sync honesty and alignment:** when enabled and configured, validate visible mouth/audio timing; when not configured, report unavailable rather than claiming success.
10. **Living backgrounds:** parallax/environmental motion and motivated lighting remain coherent without distracting flicker.
11. **Movie Studio finishing:** Cartoon shots compose through Studio while preserving the approved designs, audio, captions, timing and sequence; failure of Studio must fail the project transparently.
12. **Interrupted-job recovery:** interrupt a queued/rendering project, resume or retry without duplicate finalization, lost assets or false completed state.

## Evidence required for release
For every acceptance test retain the prompt and settings, model/checkpoint identifier and provenance, runtime version, seed where supported, job IDs, logs, output artifact, automated metrics, human review rubric and pass/fail decision. Run the actual GPU endpoint; prompt-string unit tests and successful compilation do not count as rendered animation acceptance evidence. Release gates include endpoint health, checkpoint checksum/provenance, successful short renders, output security validation, timing/language checks, and continuity review.


## Unified ReDom Video Intelligence and 00:59 ceiling

ReDom Video coordinates Movie Intelligence and Cartoon Intelligence in one creative workflow. Every delivered video, whether live-action-style movie, animation, anime, animal cartoon or mixed-format short, must be no longer than 59 seconds (00:59). Enforce this in API request validation, Studio project planning, worker schema validation, compose payloads, final media probing and backend completion validation. Do not silently trim a planned 60+ second story after generation; reject or re-plan the project to fit the ceiling. The 59-second rule applies to the final composed export as well as direct generation.

### Shared creative recommendation and memory
- Combine the creator's current prompt and reference assets with authorized ReDom project memory: recurring characters, preferred language/dialect, genre, prior approved style briefs, continuity decisions and previously accepted/rejected creative directions.
- Use public, accessible internet sources to research current high-level creative trends and craft techniques across short-video platforms such as Facebook and TikTok, plus film/anime/art references when relevant. Treat this as research for inspiration and context, not access to private feeds, private messages, private recommendation signals or non-public platform data.
- Keep source URL, retrieval timestamp, factual finding, creative interpretation and rights/usage notes distinct. Never present a trend inference as a verified platform ranking without evidence.
- Recommend concepts by jointly considering prompt intent, project memory, selected audience/genre, platform aspect ratio, trend evidence, production feasibility, language/cultural context and novelty. Recommendations must not override the creator's instructions.
- Synthesize original story hooks, visual beats, character actions, camera/edit rhythm, sound/dialogue direction and a memorable ending. Do not copy another creator's video, exact shot sequence, protected characters, dialogue, music, logos or signature designs.
- If internet research is unavailable, continue from prompt and authorized ReDom memory and disclose that current trend research was not performed. Do not invent live trends.
- Provide multilingual output direction for the creator's requested language, locale/dialect, register, emotion, pacing, captions and pronunciation. Do not claim spoken audio or accurate lip-sync unless the configured audio pipeline produced and validated it.

### Shared Movie Studio / Cartoon workflow
1. Creative planning combines the creator prompt, authorized ReDom memory and researched public creative signals.
2. Movie Studio acts as showrunner/editor: concept recommendation, hook, beat sheet, shot plan, camera, pacing, language/audio plan and final assembly.
3. For cinematic live-action-style output, Movie Intelligence directs the Video/Studio rendering path.
4. For animation, Cartoon—R8.0 renders the approved human/animal/creature shots with stable model sheets, acting, motion and medium-specific art direction.
5. Studio finishes either format while preserving the approved story, identity, visual medium, language and audio timing.
6. A final duration gate verifies the exported file is at most 59 seconds before it can be marked complete.

This shared workflow does not mean one checkpoint automatically contains both animation and movie capability. The appropriate model endpoint, compatible checkpoint, credentials and GPU runtime must be deployed and acceptance-tested independently.
