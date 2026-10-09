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
