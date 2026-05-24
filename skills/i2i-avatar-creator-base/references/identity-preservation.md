# Identity Preservation Guide

This file explains how to lock the identity of any AI avatar when generating image-to-image prompts. The avatar's physical features live in the source reference image(s) — you don't describe them from scratch, you instruct Nano Banana to preserve them.

## The principle

In image-to-image, you're not creating a person — you're placing an existing person (defined by the reference image) into a new scene. Nano Banana has two tendencies to fight against:

1. **It "improves" subjects** — smooths skin, lightens tan, slims body, plumps lips, symmetrizes face. These are AI defaults that destroy identity.
2. **It drops details** — if the prompt is long or scene-heavy, it may compress the identity to make room for the new scene description.

Your preservation phrase counters both tendencies.

## The mandatory preservation phrase

Include this in every prompt, ideally as the second sentence after the opening shot description.

### Standard version (default for most prompts)

> Preserve the exact identity from the reference image: same face structure, same eye shape and color, same eyebrows, same nose shape, same lip shape, same skin tone and texture, same hair color and texture, same body proportions. Do not smooth the face. Do not soften the features. Do not modify the face or body in any way.

### Multi-reference version (when using Seedream or any platform that accepts 2+ reference images)

> Preserve the exact identity from all reference images: same face structure, same eye shape and color, same eyebrows, same nose shape, same lip shape, same skin tone and texture, same hair color and texture, same body proportions. Do not smooth the face. Do not soften the features. Do not modify the face or body in any way.

### Short version (for tight close-ups where the body is mostly out of frame)

> Preserve the exact identity from the reference image: same face, same eyes, same eyebrows, same nose, same lip shape, same skin tone and texture, same hair. Do not smooth or soften the face.

### Long version (when distinctive features need explicit emphasis)

> Preserve the exact identity from the reference image: same face structure, same eye shape and color, same eyebrow shape, same nose shape, same lip shape, same skin tone and texture (including any natural marks, freckles, or moles fully visible), same hair color, length and texture, same body proportions and silhouette. Do not smooth the face. Do not soften the features. Do not symmetrize. Do not modify the body. Preserve all natural asymmetries and distinctive features visible in the reference.

## Universal identity categories to lock

These categories apply to ANY avatar:

1. **Face structure** — overall shape, cheekbones, jawline
2. **Eye shape and color** — almond/round/hooded, blue/green/brown/hazel
3. **Eyebrows** — thickness, arch, color
4. **Nose** — shape, size, bridge
5. **Lips** — shape, fullness, cupid's bow
6. **Skin tone** — fair/light/medium/olive/tan/dark
7. **Skin texture** — pores, freckles, marks (whatever exists in the reference)
8. **Hair** — color, length, texture (straight/wavy/curly)
9. **Body proportions** — overall silhouette, build, shoulder width, height impression

## What CAN vary (the scene-specific variables)

These can change per prompt freely:

- Hairstyle (down / up / ponytail / bun / braid)
- Outfit (any style)
- Pose / body angle / hand position
- Facial expression
- Makeup (none / minimal / glam — match the scene)
- Accessories / jewelry
- Location / scene / background
- Time of day / lighting

## Customizing the preservation phrase for the specific avatar

If the avatar has distinctive features that Nano Banana might erase, add them explicitly. Read the reference image and identify what makes the avatar visually distinctive, then add it.

**Common distinctive features to lock when present:**

| Feature | Add this to the preservation phrase |
|---------|------------------------------------|
| Freckles | "preserve all freckles and sun spots fully visible across face, shoulders, chest, and arms — no fading, no smoothing" |
| Muscular build | "preserve the muscular athletic physique with developed [shoulders/arms/legs] and natural muscle definition — do not slim down" |
| Tattoos | "preserve all visible tattoos exactly as shown in the reference — placement, design, color" |
| Specific hairstyle signature (e.g., slicked back, specific ponytail) | "same dark/blond/brown/red hair worn [exact style] with [face-framing strands / specific detail]" |
| Distinctive eye color | "same [exact color, e.g., light olive-green / steel blue / amber] eye color" |
| Beauty mark / mole | "preserve the [beauty mark / mole] on the [location] exactly as in reference" |
| Strong tan / specific skin tone | "preserve the [warm olive / golden tan / fair / deep brown] skin tone — do not lighten or shift" |
| Specific body type (curvy, slim, athletic, etc.) | "preserve the [exact body type] proportions as shown in the reference" |
| Lip piercing / nose ring | "preserve the [exact piercing] in its current placement" |

**How to write the customized phrase**:

Start with the standard preservation phrase, then add the distinctive features at the end. Example:

> Preserve the exact identity from the reference image: same face structure, same eye shape and color, same eyebrows, same nose shape, same lip shape, same skin tone and texture, same hair color and texture, same body proportions. Do not smooth the face. Do not soften the features. Do not modify the face or body in any way. **Preserve all freckles fully visible across face, shoulders, and arms. Preserve the muscular athletic physique. Preserve the small wrist tattoo.**

## Common Nano Banana mistakes (and counter-phrases)

Nano Banana has known tendencies to "improve" subjects in ways that destroy identity. These mistakes are universal — they apply to any avatar.

| Mistake | Counter-phrase to add |
|---------|----------------------|
| Smooths the skin / removes texture | "Natural skin texture fully preserved, no smoothing, no airbrushing, no skin retouching" |
| Removes freckles, moles, marks | "Preserve all skin marks, freckles and natural texture fully visible — no fading" |
| Slims the body / changes proportions | "Preserve exact body proportions from the reference — do not slim down, do not adjust silhouette" |
| Lightens / darkens skin tone | "Maintain the exact skin tone from the reference — do not lighten, do not darken" |
| Symmetrizes the face | "Preserve natural facial asymmetry and real-world proportions from reference — do not symmetrize" |
| Plumps lips | "Preserve exact lip shape and fullness from reference — do not plump, do not enlarge" |
| Adjusts nose shape | "Preserve exact nose shape from reference — do not refine, do not narrow, do not modify" |
| Adds beauty filter / glow | "No beauty filter, no artificial glow, no Instagram filter, natural skin only" |
| Plastic / airbrushed look | "Skin must show real-world texture: pores, natural shine, natural imperfections — no plastic skin, no airbrushing" |
| Modifies muscle definition | "Preserve exact muscle definition from reference — do not smooth, do not soften, do not de-emphasize" |
| Adds too much makeup | "Minimal natural makeup only — no heavy makeup, no glam, no contour" (unless scene calls for it) |

## How to read the reference image to know what to lock

Before writing the prompt, look at the reference image and answer:

1. What is the avatar's most distinctive feature? (Lock it explicitly.)
2. What's something Nano Banana would likely "improve" away? (Counter-phrase it.)
3. What's the skin texture like? (Specify if there are visible pores, freckles, marks.)
4. What's the body type? (Specify if it's not generic-slim.)
5. What's the hair signature? (Specify color, length, default style.)

The more distinctive the avatar, the more important customization becomes. A "generic-looking" avatar may only need the standard preservation phrase. A heavily-distinctive avatar (lots of freckles, very muscular, specific hair, tattoos) needs the long customized version.

## When you're not sure if a request fits the avatar

If the user asks for a scene that might not fit the avatar's natural identity, flag it before writing:
- A scene that requires a very different body type → suggest adapting the scene rather than the body
- A scene that requires a very different skin tone (e.g., heavy winter scene for a deeply tanned avatar) → suggest a setting that fits
- A scene that requires her to look much older or younger → ask for confirmation

The avatar should always read as the same person. Identity coherence > scene flexibility.

## Multi-reference workflows (Seedream, Flux Kontext, etc.)

When the platform accepts multiple reference images at once (typically 2-4), use the multi-reference phrase variant. Multi-reference is significantly better for identity consistency because:

- The model triangulates the identity from multiple angles
- It captures features visible from one angle but not another (e.g., side profile, back, full body)
- It reduces hallucination of features the model is uncertain about

When user has multi-reference capability, recommend they upload:
- 1 clear front-facing face shot
- 1 side or 3/4 profile
- 1 full-body or hip-up shot
- 1 contextual shot showing hairstyle/build naturally

This combination gives the model maximum identity info to preserve.
