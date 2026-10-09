# Cartoon—R8.0: Animation Intelligence and Production Specification

Status: required implementation specification; not a claim that the capabilities are already implemented or validated.

## 1. Mission

Cartoon—R8.0 is ReDom's dedicated animation model product. It must create original, coherent, emotionally engaging animation for humans, animals, anthropomorphic characters, fantasy creatures and environments, from short clips through complete films, episodes and series.

The quality benchmark is professional feature animation and leading anime production: character appeal, acting, timing, art direction, environment detail, sound, storytelling and finishing. This is a target to measure against, not a guaranteed outcome. Do not copy protected studio characters, proprietary assets, scripts, or a specific existing production's distinctive expression. Produce original ReDom-controlled designs.

Cartoon is not a style switch for ReDom-v2.8—Video. It must have a distinct runtime identity, animation-oriented model/configuration, inference contract, queue/capacity policy, and animation-specific evaluation. Shared platform infrastructure is allowed; silent model substitution is not.

## 2. User-facing creative direction

The creator must be able to select or describe a visual direction and preserve it across all shots and episodes:

- Feature-quality stylized 3D animation.
- Hand-drawn 2D animation and cel-animation looks.
- Original anime-inspired designs and production conventions.
- Stylized 2D/3D hybrids.
- Painterly, stop-motion-inspired, cut-out, miniature, and graphic-novel directions where supported.
- Naturalistic animal animation, stylized animals, anthropomorphic casts, and original fantasy creatures.
- Educational, preschool, family, comedy, adventure, action, drama, horror, romance, science fiction, fantasy, musical and documentary-style animation, subject to age and safety controls.

Represent art direction as structured project state, not only prompt adjectives: shape language, proportions, line quality, palette, materials, shading, texture, frame cadence, exaggeration level, facial-design rules, environment design, camera language, compositing and allowed deviations. Lock the approved style bible and version it. A scene must not drift into another visual style unless the creator approves a change.

### Reference-aware art-direction intelligence

When requested, the system researches publicly accessible, legally usable sources to identify relevant genre and animation conventions, such as broad anime subgenres, period references, camera grammar, traditional techniques, animal behavior, architecture, costume and cultural context. It should recommend a *directional recipe* (e.g. expressive limited-animation timing, cinematic painted backgrounds, dynamic action staging) and explain why it fits the story.

It must distinguish:
1. creator-supplied references;
2. factual/cultural reference information;
3. broad genre and technique observations;
4. licensed/public-domain assets;
5. original generated design decisions.

Store source title, URL, retrieval date, relevant claim, provenance category and rights notes. Treat pages and uploaded files as untrusted content, never as system instructions. Do not scrape access-controlled sources or copy a protected series shot-by-shot. A reference to a named anime may guide high-level discussion, but output should use original characters and a distinct composition/design unless the creator has the necessary rights. The system must not claim Internet research grants reuse permission.

## 3. Dedicated animation model architecture

Define and provision a real Cartoon runtime. Its configured model identifier is `Cartoon—R8.0`, runtime identity `redom-cartoon-native`. Record exact checkpoint, checkpoint hash/version, license, model card, inference code version, precision, scheduler, adapters, dependencies, supported operations and GPU profile.

The runtime must reject requests that specify another model identity. It must never use the standalone Video runtime as a silent fallback. If Cartoon weights or GPU capacity are unavailable, fail with a clear retriable/unavailable status and preserve the job for retry.

Do not use Wan2.2 TI2V-5B or any other existing checkpoint as proof that a dedicated Cartoon model exists. Candidate animation/character models may be evaluated as components, but before adoption assess:
- anime/stylized-human/animal quality on controlled prompts;
- character and style consistency across views and scenes;
- motion controllability and temporal stability;
- resolution, clip duration, throughput and peak VRAM;
- license and commercial use terms;
- compatibility with ReDom's GPU worker and security model;
- repeatability, model provisioning and failure behavior.

Model selection must be supported by recorded evaluation results, not by model names or promotional claims. Provision large weights ahead of traffic; never download multi-gigabyte checkpoints inside a user generation request.

## 4. Character identity and asset bible

Create persistent, versioned character records for each approved character, including:
- unique stable character ID and approved design version;
- front, side, three-quarter, back and full-body turnaround references where applicable;
- face, eye design, proportions, silhouette, skin/fur/feather/scale colors, markings, hair, costume, accessories, materials and distinctive features;
- expression sheet: neutral, joy, sadness, anger, fear, surprise, disgust, embarrassment, confusion and project-specific emotions;
- phoneme/viseme references where needed for dialogue;
- movement profile, posture, gait, gesture vocabulary, timing, personality and species-specific behaviors;
- voice ID, language/locale, accent, pronunciation guide, pitch range, vocal texture, speaking rhythm and emotional range;
- approved changes, revisions, reference assets, and their provenance.

Build a character consistency service that supplies approved references and constraints to every shot. It must flag changed faces, proportions, markings, costume, colors or voice identity. Do not silently accept identity drift. A deliberate costume change or character redesign must be a versioned story event.

Support humans, children and adults in appropriate contexts, diverse body types, animals, anthropomorphic characters, non-humanoid creatures and multi-character scenes. For animals, maintain species-specific skeletal structure, joint limits, gait, balance, eye placement, muzzle/beak anatomy, paw/hoof/claw behavior, tail/ear/wing movement and contact with the environment. Stylization may exaggerate these features, but should do so consistently.

## 5. Animation performance and motion

The animation pipeline must model performance, not just image appearance:
- anticipation, action, follow-through, overlap, squash/stretch when stylistically appropriate, arcs, timing, spacing, weight, contact, balance and believable deformation;
- expressive eyes, blinks, brows, mouth shapes, head motion, posture, gestures, gaze and emotional transitions;
- natural interaction with props and other characters, including contact, grip, release, collision, occlusion and cause/effect;
- hair, fur, feathers, cloth, accessories, water, foliage, particles, smoke and other secondary motion;
- coherent action across cuts, with screen direction, eyelines, geography and staging maintained;
- action choreography, readable silhouettes and controlled motion blur;
- background activity matched to the scene without distracting from foreground acting.

Use reference performance, pose/skeleton guidance, key poses, motion curves, camera instructions or other controls when supported by the chosen model. Record which controls were actually applied. Do not claim a control is supported when the runtime ignores it.

## 6. Environments, layouts and cinematography

Treat the background as an animated part of the scene. Generate and preserve a location bible with layout, geography, palette, lighting, time of day, materials, recurring props, atmosphere and approved reference images.

Support meaningful activity: moving foliage and clouds, water, wildlife, crowds, vehicles, machinery, weather, reflections, shadows and environmental effects when appropriate. Background characters must not freeze, duplicate in obvious loops, stare unnaturally, or contradict the main action.

Provide shot-level controls for establishing/wide/medium/close-up shots, inserts, over-the-shoulder framing, tracking, pans, tilts, dolly movement, static staging, depth and composition. Choose camera language according to genre and emotion. Maintain consistent location geometry, lighting direction, screen direction and eyelines between shots. The renderer must preserve the chosen aspect ratio and frame safe areas for captions and subtitles.

## 7. Complete production workflow

Support a hierarchy of project → season/series → episode → sequence → scene → shot → render version.

Required workflow:
1. creative brief and target audience;
2. optional source-aware research and rights/provenance capture;
3. story proposal and creator approval for major decisions;
4. script, dialogue and episode/scene breakdown;
5. style bible, character bible, location bible and props bible;
6. storyboard, layout, key poses and animatic/timing plan;
7. voice casting and dialogue recording/generation;
8. shot generation using the dedicated Cartoon runtime;
9. animation-specific checks and selective regeneration;
10. scene assembly, editing, sound, music, subtitles and compositing;
11. final encode, playback/technical validation and secure delivery.

Do not treat a full episode as one giant prompt or one model call. Keep successful approved shots immutable; new renders create new versions. Checkpoint production state at scene and shot level, make submissions idempotent, and resume using validated assets after interruption. Support cancellation, bounded retries, per-shot regeneration, explicit approval gates, progress and cost estimates based on measured performance.

## 8. Language, dialogue, voice and lip-sync

Language is an end-to-end production setting, not just prompt translation. Explicit creator language overrides detection. Persist project language, per-character language/locale, dialect, pronunciation notes, voice ID, dialogue version, timing, subtitles and lip-sync capability status.

Initial language acceptance set:
- English;
- Mandarin Chinese and separately specified Cantonese/other supported Chinese varieties;
- Japanese;
- Korean;
- Spanish;
- French;
- Arabic, including right-to-left subtitle handling;
- Hindi.

Additional languages may be enabled only after capability testing. Never report all languages as supported simply because a speech provider accepts a language code.

Dialogue must preserve meaning, idioms, humor, cultural context, character personality and emotional subtext. The same character should retain a recognizable voice identity between scenes and episodes. Support distinct speaking styles such as whispering, shouting, crying, laughing, breathless speech, calm narration, comedic delivery, dramatic emphasis, singing and animal vocalizations where the selected voice/audio models genuinely support them. Singing identity must not be assumed to match speaking identity without validation.

The required order for a lip-synced shot is: finalize dialogue/localization → generate or record the final voice track → determine word/phoneme timing where available → generate facial/mouth motion conditioned on the final audio → inspect synchronization → approve. If a language/voice/lip-sync combination is unsupported or low-confidence, disclose it and do not mark it passed.

Use language-aware script shaping, fonts, glyph coverage, punctuation, RTL layout, subtitle line-breaking and safe margins. Validate subtitle spelling and timing. Mix dialogue clearly above score and effects. Track music and sound provenance.

## 9. Audio and sound design

Plan sound per scene and shot:
- dialogue, breaths, reactions, laughter and vocalizations;
- footsteps, cloth, props and interaction foley;
- environment beds, weather, wildlife, machinery and crowd ambience;
- original score, emotional cues, transitions, stingers and silence;
- mix levels, panning, fades, loudness and final synchronization.

Audio must follow action and cuts. Reuse coherent room tone and environmental beds across connected shots. Avoid sudden unexplained changes, repeated obvious loops, clipping, or music that masks speech. Generated songs and lyrics must be original or licensed, and assets must retain provenance.

## 10. Post-production and delivery

Implement a real finishing pipeline:
- edit according to the approved storyboard and timing plan;
- normalize frame rate, resolution, color and audio formats;
- continuity-aware transitions, cuts, pacing and shot coverage;
- compositing, approved effects, depth layers and background integration;
- consistent grading appropriate to the selected animation style;
- selectable subtitle tracks or accurately rendered subtitles;
- title cards, credits and required ReDom provenance/watermark policy;
- validate duration, aspect ratio, frame rate, codecs, frame integrity, audio, subtitles and final playback.

Do not use generic sharpening/upscaling to imply native detail or substitute for animation quality. Report actual generation resolution and all enhancement stages.

## 11. Research and creative recommendation intelligence

When the creator says “recommend the best anime direction for this story,” “research the right style,” or gives a known genre, the system should:
1. parse story genre, intended audience, emotional tone, cultural setting, action density, character type and production length;
2. research relevant public sources when useful, including official creator/studio material, reputable interviews, film/animation reference sources, art history, folklore, architecture and cultural references;
3. identify broad techniques and genre conventions, not just return a list of show names;
4. propose 2–4 differentiated art-direction recipes with trade-offs in mood, animation complexity, continuity risk and estimated resource needs;
5. explain the recommendation and ask for approval when the choice materially changes the creative identity;
6. store the approved choice in the style bible and apply it consistently to all scenes;
7. preserve source citations and distinguish facts from interpretations and original inventions.

Do not conduct unnecessary research for simple prompts. Do not reproduce copyrighted screenplays, novel passages, episode plots, exact shot sequences, logos, proprietary character designs or protected assets. Creator-supplied material must not be assumed licensed merely because it was uploaded.

## 12. Database and API contract

Extend existing ReDom project and Studio records safely. Do not replace the existing schema or delete historical data unnecessarily.

Persist at least:
- model ID/version, runtime ID, checkpoint hash, generation configuration and actual hardware;
- project/episode/scene/shot states and idempotency keys;
- style bible and version, character/location/prop identity versions;
- research source records and provenance/rights metadata;
- storyboard, prompts, reference assets, seed when supported and generation metadata;
- voice assignments, dialogue versions, language, subtitle tracks and synchronization results;
- render versions, approval state, QA findings, retry history, resource usage and errors.

Use authenticated APIs, strict schemas, authorization and entitlement checks, private object storage, signed delivery URLs, callback authentication, output security validation, and explicit state transitions. The runtime must reject model/runtime mismatches. Preserve old jobs under explicit legacy semantics rather than silently reinterpreting them.

## 13. Quality gates

Create a Cartoon-only evaluation suite. Evaluate:
- character identity across angles, shots and episodes;
- art-direction consistency;
- anatomy, pose, motion arcs, contact and body mechanics;
- facial acting and emotional readability;
- lip-sync, pronunciation and language correctness;
- animal behavior and anatomy;
- environment richness and background motion;
- camera/staging continuity;
- temporal flicker, warping, duplicate limbs, melting details, texture crawl and frozen characters;
- story clarity, pacing, soundtrack and overall watchability.

Automated checks should flag defects; human reviewers must judge acting, emotion, artistic quality and story coherence. Compare revisions using the same prompts and reference conditions. Store scores, reviewer notes and actual sample asset keys. A successful API response is not a quality pass.

## 14. Mandatory Cartoon acceptance tests

Every test must be recorded as PASS, FAIL or UNVERIFIED with build/checkpoint IDs and real output evidence.

1. **Human character continuity:** one original character in at least six shots with different angles, expressions, poses and lighting; face, body, costume and style remain stable.
2. **Animal sequence:** an original animal walks, runs, turns, interacts with a prop and expresses emotion with species-appropriate anatomy and consistent environment.
3. **Multi-character acting:** at least three characters converse, react to each other, gesture, maintain eyelines and take turns speaking without duplicated or frozen background behavior.
4. **Style control:** produce the same short brief in two intentionally distinct supported art directions; each remains internally consistent and is not merely a prompt label.
5. **Environment quality:** a populated street, forest, school, home or equivalent environment with appropriate background activity and no obvious repeated loops.
6. **Language and lip-sync:** English and Mandarin test dialogue with distinct voice assignments, pronunciation review, subtitle checks and measured lip-sync. Test other languages independently before advertising support.
7. **Long-form episode:** produce a complete multi-scene short episode with approved story/character/style bibles, sound, transitions and credits.
8. **Revision integrity:** change one character attribute or story decision and confirm only affected assets are revised; approved unrelated shots remain intact.
9. **Recovery:** interrupt generation, resume and prove completed shots were reused.
10. **Model isolation:** Cartoon jobs reach only the configured Cartoon runtime; missing weights or runtime cannot silently fall back to Video.
11. **Security and failure:** test invalid prompts, unauthorized assets, invalid callbacks, missing checkpoints, GPU exhaustion, audio failure, malformed output, cancellation and retries.
12. **Regression:** existing Video and Studio jobs, historical projects and other ReDom features continue working.

## 15. Deployment and cost transparency

Document each selected checkpoint's license, download/provisioning procedure, checksum, storage size, GPU VRAM, startup time, throughput, supported duration/resolution and measured costs. Set separate concurrency and resource budgets so long episodes cannot starve short animation jobs or standalone Video jobs.

Estimate costs from measured render time, target duration, resolution, shot count, retries, audio, lip-sync and finishing. Never promise exact completion time without reliable measurements. Do not download large weights during generation requests.

## 16. Delivery definition

Cartoon—R8.0 is not considered production-ready until:
- a genuine dedicated animation runtime is deployed and isolated;
- its checkpoint/license/configuration are documented;
- all mandatory tests have evidence and explicit pass/fail/unverified status;
- rendered examples demonstrate human, animal, multi-character and multilingual scenes;
- long-form recovery, security and regression tests pass;
- actual GPU performance and cost measurements are published;
- limitations are visible to the creator and unsupported combinations are not marked complete.

A registry entry, model name, cinematic prompt, successful build or upscaled 720p output is not evidence of top-tier animation quality.
