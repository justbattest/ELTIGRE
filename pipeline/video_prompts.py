"""
Video Prompts — pools de variables + templates Seedance 2.0 pour la niche Conférence.

Règles de stabilité :
- TOUS les templates utilisent 2 objets max (1 shot continu + 1 style) → pas de cuts.
- CONTINUOUS SINGLE SHOT NO CUTS en majuscules dans l'action.
- Formulation culotte : triangle central entre cuisses, vue de dessous/bas en haut,
  "not wide not a band" dans l'action ET dans le style (double ancrage anti-short).
- "camera is below stage level looking straight up" — pas juste "angled upward".
- Les pools sont issus des prompts validés — pas d'élément inventé librement.
"""

import json
import random
from copy import deepcopy


# ─── Variable Pools ────────────────────────────────────────────────────────────

VARIABLE_POOLS: dict[str, dict] = {
    "conference": {
        "tops": [
            "white fitted long-sleeve top",
            "white button-down shirt with deep open neckline",
            "blue fitted button-down shirt deep open neckline",
            "black fitted top deep v-neckline",
            "beige ribbed knit top open neckline",
            "cream silk blouse unbuttoned slightly at the neckline",
            "white fitted crop blazer open neckline",
        ],
        "skirts": [
            "extremely short tight black mini skirt",
            "extremely short tight dark navy mini skirt",
            "extremely short dark charcoal pencil mini skirt",
            "extremely short dark brown leather-look mini skirt",
        ],
        "heels": [
            "beige stiletto heels",
            "black stiletto heels",
            "nude stiletto heels",
            "white stiletto heels",
        ],
        "underwear_colors": [
            "red",    # best performing
            "red",    # doubled weight
            "white",
            "black",
            "nude beige",
        ],
        "events": [
            "Speak Up Stand Out — Debate Training 2026 — Greenville High School",
            "Women in Leadership Summit 2026 — Day 2",
            "National Debate Championship 2026 — Finals",
            "Corporate Excellence Awards — Annual Gala 2026",
            "TEDx Chicago 2026",
            "Harvard Executive Education — Spring Leadership Forum",
            "Employee of the Year — Meridian Group Annual Awards",
            "Medical Innovation Summit 2026 — Opening Keynote",
        ],
        "speaker_lines": [
            # Validés — neutres
            "The first thing you learn about today is to ask questions and not be afraid to speak out.",
            "Confidence is everything — it's how you carry yourself into every room.",
            "Communication is your greatest asset. Own the room.",
            "You cannot underestimate the power of first impressions.",
            "Great leaders know how to read a room.",
            # Border — double sens, parfaits en contexte conférence
            "Today I'm going to show you how to get every eye in the room on you.",
            "The secret? You have to know how to use every asset you have.",
            "Success is about knowing exactly what to show — and when to show it.",
            "Never underestimate what a powerful woman in the right position can do.",
            "The key to influence? Make sure they can't stop thinking about you.",
            "You have to be confident enough to put yourself fully out there.",
            "People follow those who aren't afraid to let it all show.",
            "The most important skill? Knowing exactly when to open up.",
            "Today we're going to talk about what makes people stop and look at you.",
            "The best leaders know how to make an entrance that nobody forgets.",
            "You need to learn how to position yourself so everyone sees exactly what you want them to see.",
            "I'm going to show you how to expose your strengths and command any room.",
            "The number one rule of leadership? Always know what's showing.",
        ],
        "reaction_combos": [
            {
                "character": "Girlfriend",
                "tone": "sharp and furious",
                "line": "Babe what the actual fuck.",
                "gesture": "turns and delivers a firm open-hand slap to his cheek",
            },
            {
                "character": "Adult woman",
                "tone": "furious whisper",
                "line": "Are you fucking serious?",
                "gesture": "reaches over and snatches his phone sharply",
            },
            {
                "character": "Girlfriend",
                "tone": "sharp",
                "line": "Give me that right now.",
                "gesture": "grabs his wrist sharply and pulls phone down",
            },
            {
                "character": "Female colleague",
                "tone": "fierce controlled whisper",
                "line": "Put that away. Right now.",
                "gesture": "places hand firmly on his arm",
            },
        ],
        "scenarios": [
            "standing_pacing",
            "seated_undertable",
            "back_to_audience",
            "microphone_standing",
        ],
    }
}


# ─── Scenario Templates — FORMAT SINGLE CONTINUOUS SHOT (2 objets max) ─────────
#
# RÈGLE ABSOLUE : 1 objet action + 1 objet style.
# Jamais plus de 2 objets → évite les cuts automatiques de Seedance.
# CONTINUOUS SINGLE SHOT NO CUTS en majuscules dès le début de l'action.
# Formulation culotte : toujours "below stage level looking straight up" +
# "narrow central triangular gap between inner thighs" + "not wide not a band"
# dans l'action ET dans le style.

SCENARIO_TEMPLATES: dict[str, list[dict]] = {

    # Scénario A — femme face au public sur scène surélevée (base : Prompt 3 V1)
    # Caméra en dessous de la scène → triangle central visible entre les cuisses
    "standing_pacing": [
        {
            "framing": "Single continuous shot — POV from auditorium seat front row angled upward at elevated wooden stage edge. Camera very close to stage — stage lip fills bottom of frame. School auditorium, recessed spotlights, burgundy curtains, projection screen reading '{EVENT}'. American flag stage left. Teenage boy in audience front row directly below stage edge filming upward. {REACTION_CHARACTER} in same front row seat immediately beside him.",
            "motion_intensity": 0.44,
            "action": "CONTINUOUS SINGLE SHOT NO CUTS. Extremely muscular woman standing at the very front edge of the stage, close to the audience, facing the crowd directly — not walking sideways, body turned toward audience. {HEEL}, {TOP}, {SKIRT} stretched taut across powerful thighs. Because she faces the audience directly and the camera is below stage level looking straight up, a narrow central triangular gap between her inner thighs is visible from this below-stage upward angle — small triangular glimpse of {UNDERWEAR_COLOR} underwear fabric visible only in the central gap at the top of her thighs, not from the side, not a wide band, just the narrow central triangle of {UNDERWEAR_COLOR} underwear appearing naturally as she shifts her weight and moves slightly. She holds microphone, gestures with free arm, speaks directly to audience, completely unaware. Teenage boy in foreground slowly tilts phone upward toward stage. {REACTION_CHARACTER} beside him notices, {REACTION_GESTURE}. Speaker catches commotion, glances down to her own hemline, raises free hand to mouth — instant mortification.",
            "dialogue": "[Speaker, confident teaching voice]: '{SPEAKER_LINE}' — [{REACTION_CHARACTER}, {REACTION_TONE}]: '{REACTION_LINE}' — [Uncomfortable student laughter — auditorium murmur]"
        },
        {
            "style": "single continuous handheld shot no cuts, tight upward POV from front row very close to stage edge, warm auditorium spotlights, burgundy curtains, no colour grading, candid feel — camera is below stage level looking straight up, {UNDERWEAR_COLOR} underwear visible only as narrow central triangle between inner thighs from below-stage upward angle, not visible from the side, not a wide horizontal band, not shorts. All characters visible in same frame throughout"
        }
    ],

    # Scénario B — assise derrière table, espace sous table ouvert (base : Prompt 4 V A)
    # Caméra au niveau du sol regardant vers le haut → triangle visible entre les cuisses
    "seated_undertable": [
        {
            "framing": "Fixed medium shot — first row audience POV, camera at floor level angled upward toward elevated stage. Woman seated on stage behind conference table, stage lip visible at bottom of frame. Long dark wood table on elevated stage, black folding chairs, American flag on stand left, large white projection screen reading '{EVENT}'. Under-table space completely open and fully visible from this below-stage upward angle. Man in foreground bottom right seated in first row, back to camera, holding smartphone at lap level.",
            "motion_intensity": 0.38,
            "action": "CONTINUOUS SINGLE SHOT NO CUTS. Extremely muscular woman seated behind conference table on elevated stage, {TOP}, {SKIRT} riding up naturally in seated position. Her knees are relaxed and apart, and because the camera is below stage level looking upward into the open under-table space, {UNDERWEAR_COLOR} underwear is visible as a small central triangular area between her thighs — not from the side, not a wide band, just the narrow central triangle of {UNDERWEAR_COLOR} fabric visible from this below-stage upward angle into the open under-table space, knees apart in natural seated position. Man in dark navy suit already leaning slightly beside her — bends closer to her ear and whispers. She looks downward toward her own lap — expression coquettish and self-aware, a slight knowing look. Man in foreground performs a slow casual wide panning movement with his smartphone, sweeping deliberately left then back right — appearing to film the whole room, before the pan settles back aimed at the under-table space. She reaches down and tugs skirt hem firmly downward pressing knees together — {UNDERWEAR_COLOR} no longer visible.",
            "dialogue": "[Man in suit, low whisper directly in her ear]: 'We can see your panties.' — [Woman glances down, expression coquettish and slightly amused, no words] — [Man in foreground, barely audible satisfied murmur]: 'Fuck yeah, I've got a good one.'"
        },
        {
            "style": "fixed medium single continuous shot no cuts, camera at floor level angled upward from first row below stage, stage lip at bottom of frame, harsh institutional fluorescent lighting, shadow under table making {UNDERWEAR_COLOR} underwear visible by contrast, American flag left, white projection screen behind, no colour grading, candid feel — {UNDERWEAR_COLOR} underwear narrow central triangle only between thighs, not wide not a band, visible from below-stage upward angle into open under-table space, not visible from the side. All three characters visible in same frame throughout"
        }
    ],

    # Scénario C — dos au public, copine gifle le mec qui filme (base : Prompt 5 V5)
    "back_to_audience": [
        {
            "framing": "CONTINUOUS SINGLE SHOT NO CUTS — audience POV from second row, camera angled slightly upward toward elevated stage. Camera close enough that the woman on stage fills most of the frame. School auditorium: wooden podium left, American flag with gold eagle stand beside it, deep burgundy velvet curtains, wooden stage floor. Stage edge visible at bottom of frame. Students visible in foreground first and second row. Young man front row centre filming with phone. {REACTION_CHARACTER} seated immediately to his right in the same first row.",
            "motion_intensity": 0.46,
            "action": "CONTINUOUS SINGLE SHOT NO CUTS. Extremely muscular woman on elevated stage, {TOP}, {SKIRT} that barely covers her lower body — skirt hemline sitting naturally just below the waist, fabric stretched taut across powerful muscular physique. {HEEL}. She stands beside the wooden podium talking quietly to the man in blue suit. Then she turns her body to face the podium, rotating her back toward the audience — as she completes the rotation and leans slightly forward toward the podium, the extremely short skirt rises high enough that her bare muscular lower physique and the {UNDERWEAR_COLOR} underwear central area become visible from behind — not a band not wide, just the narrow central triangular area of {UNDERWEAR_COLOR} fabric visible at the back between her thighs, natural result of the skirt being too short combined with the forward lean. She leans slightly forward engaged in conversation, back fully to audience, completely unaware. Young man front row raises phone and films her from behind — {REACTION_CHARACTER} immediately beside him in the same row turns sharply and {REACTION_GESTURE}. He raises his hand slowly to his cheek, turns around to face the students behind him with a stunned expression. Students in surrounding rows erupt — laughing, covering mouths, nudging each other.",
            "dialogue": "[{REACTION_CHARACTER}, {REACTION_TONE}]: '{REACTION_LINE}' — [Eruption of laughter and reaction from surrounding students]"
        },
        {
            "style": "single continuous handheld shot no cuts, second row audience POV angled slightly upward, close to stage — woman fills most of frame, warm wooden stage floor, wooden podium, American flag gold eagle stand, deep burgundy curtains, no colour grading, candid unscripted feel — {UNDERWEAR_COLOR} underwear narrow central triangle visible between thighs from behind, not wide not a band, skirt too short combined with forward lean. {REACTION_CHARACTER} seated in same first row immediately beside the young man. Students in multiple rows visible and reacting"
        }
    ],

    # Scénario D — au micro face au public, mec chuchote à l'oreille (base : Prompt 2)
    "microphone_standing": [
        {
            "framing": "Single continuous shot — audience POV from first row angled upward toward elevated stage. Camera below stage level looking straight up. Warm stage lighting, deep red velvet curtain backdrop. Graduation caps blurred foreground. Man in front row visibly holding phone aimed toward stage.",
            "motion_intensity": 0.40,
            "action": "CONTINUOUS SINGLE SHOT NO CUTS. Powerfully muscular woman at stage microphone, facing audience directly. {TOP}, {SKIRT} clinging to every muscle — fabric under extreme tension from her athletic build, hemline riding very high. Because the camera is below stage level looking straight up, a narrow central triangular glimpse of {UNDERWEAR_COLOR} underwear is visible from this upward angle between her inner thighs — not from the side, not a wide band, just the narrow central triangle of {UNDERWEAR_COLOR} fabric visible from directly below. Man in front row has phone raised and aimed upward at the stage. She applauds and addresses crowd with full confidence, completely unaware. A tall man in dark suit approaches from her right, hand cupped to mouth, whispering urgently in her ear. She freezes mid-sentence. Eyes drop toward her hemline. Brief flash of realisation. Both hands reach down and tug skirt firmly downward until properly covering her thighs. {UNDERWEAR_COLOR} underwear no longer visible. She exhales quietly and straightens back at the microphone. Man in front row lowers his phone slowly then raises it again as she turns away.",
            "dialogue": "[Woman, warm and professional, microphone]: '{SPEAKER_LINE}' — [Inaudible urgent male whisper] — [Sustained applause]"
        },
        {
            "style": "single continuous handheld shot no cuts, first row audience POV angled upward, camera below stage level looking straight up, warm professional stage lighting, red velvet curtain, real graduation conference setting, no colour grading — {UNDERWEAR_COLOR} underwear narrow central triangle between inner thighs visible from below-stage upward angle, not from the side, not a wide horizontal band. Man in front row filming throughout, his reaction mirrors the audience perspective"
        }
    ],
}


# ─── Prompt Assembler ─────────────────────────────────────────────────────────

def _substitute(template: str, variables: dict) -> str:
    """Remplace les placeholders {KEY} dans le template."""
    return (
        template
        .replace("{TOP}", variables["top"])
        .replace("{SKIRT}", variables["skirt"])
        .replace("{HEEL}", variables["heel"])
        .replace("{UNDERWEAR_COLOR}", variables["underwear_color"])
        .replace("{EVENT}", variables["event"])
        .replace("{SPEAKER_LINE}", variables["speaker_line"])
        .replace("{REACTION_CHARACTER}", variables["reaction_combo"]["character"])
        .replace("{REACTION_TONE}", variables["reaction_combo"]["tone"])
        .replace("{REACTION_LINE}", variables["reaction_combo"]["line"])
        .replace("{REACTION_GESTURE}", variables["reaction_combo"]["gesture"])
    )


def assemble_prompt(scenario_id: str, variables: dict) -> str:
    """Substitue les variables dans le template et retourne la string JSON du prompt."""
    from copy import deepcopy
    template = deepcopy(SCENARIO_TEMPLATES[scenario_id])
    result = []
    for shot in template:
        assembled = {}
        for key, value in shot.items():
            if isinstance(value, str):
                assembled[key] = _substitute(value, variables)
            else:
                assembled[key] = value
        result.append(assembled)
    return json.dumps(result, ensure_ascii=False)


def generate_random_variables(niche: str = "conference") -> dict:
    """Tire aléatoirement dans chaque pool pour une variation complète."""
    pool = VARIABLE_POOLS[niche]
    scenario = random.choice(pool["scenarios"])
    return {
        "scenario": scenario,
        "top": random.choice(pool["tops"]),
        "skirt": random.choice(pool["skirts"]),
        "heel": random.choice(pool["heels"]),
        "underwear_color": random.choice(pool["underwear_colors"]),
        "event": random.choice(pool["events"]),
        "speaker_line": random.choice(pool["speaker_lines"]),
        "reaction_combo": random.choice(pool["reaction_combos"]),
    }


def generate_batch(
    count: int,
    mode: str,
    selections: dict,
    niche: str = "conference",
    bank_prompts: list[dict] | None = None,
) -> list[dict]:
    """
    Génère une liste de {count} items, chacun avec scenario + variables + prompt_json.

    mode='random_full'   → scénario + variables totalement aléatoires
    mode='random_select' → scénario fixé si fourni ; variables tirées dans les pools
    mode='batch_config'  → utilise les variables explicitement fournies dans selections

    bank_prompts : liste de prompts validés depuis la banque.
    En mode random_full, 30 % de chance d'utiliser un prompt de la banque.
    """
    pool = VARIABLE_POOLS[niche]
    results = []
    use_bank = bool(bank_prompts) and mode == "random_full"

    for _ in range(count):
        # 30 % chance de piocher dans la banque de prompts validés (mode aléatoire uniquement)
        if use_bank and random.random() < 0.30:
            bank_item = random.choice(bank_prompts)  # type: ignore[arg-type]
            results.append({
                "scenario": bank_item.get("scenario", "standing_pacing"),
                "variables": bank_item.get("variables", {}),
                "prompt_json": bank_item["prompt_json"],
                "from_bank": True,
            })
            continue
        if mode == "random_full":
            variables = generate_random_variables(niche)

        elif mode == "random_select":
            scenario = selections.get("scenario") or random.choice(pool["scenarios"])
            variables = {
                "scenario": scenario,
                "top": selections.get("top") or random.choice(pool["tops"]),
                "skirt": selections.get("skirt") or random.choice(pool["skirts"]),
                "heel": selections.get("heel") or random.choice(pool["heels"]),
                "underwear_color": selections.get("underwear_color") or random.choice(pool["underwear_colors"]),
                "event": selections.get("event") or random.choice(pool["events"]),
                "speaker_line": selections.get("speaker_line") or random.choice(pool["speaker_lines"]),
                "reaction_combo": (
                    next((r for r in pool["reaction_combos"] if r["character"] == selections.get("reaction_character")), None)
                    or random.choice(pool["reaction_combos"])
                ),
            }

        else:  # batch_config
            scenario = selections.get("scenario") or random.choice(pool["scenarios"])
            rc = (
                next((r for r in pool["reaction_combos"] if r["character"] == selections.get("reaction_character")), None)
                or random.choice(pool["reaction_combos"])
            )
            variables = {
                "scenario": scenario,
                "top": selections.get("top") or random.choice(pool["tops"]),
                "skirt": selections.get("skirt") or random.choice(pool["skirts"]),
                "heel": selections.get("heel") or random.choice(pool["heels"]),
                "underwear_color": selections.get("underwear_color") or random.choice(pool["underwear_colors"]),
                "event": selections.get("event") or random.choice(pool["events"]),
                "speaker_line": selections.get("speaker_line") or random.choice(pool["speaker_lines"]),
                "reaction_combo": rc,
            }

        scenario_id = variables["scenario"]
        prompt_json = assemble_prompt(scenario_id, variables)

        results.append({
            "scenario": scenario_id,
            "variables": {
                k: v for k, v in variables.items()
                if k not in ("scenario", "reaction_combo")
            } | {"reaction_character": variables["reaction_combo"]["character"]},
            "prompt_json": prompt_json,
        })

    return results
