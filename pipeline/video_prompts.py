"""
Video Prompts — pools de variables + templates Seedance 2.0.

Niches disponibles : "conference", "golf"

Règles de stabilité :
- TOUS les templates utilisent 2 objets max (1 shot continu + 1 style) → pas de cuts.
- CONTINUOUS SINGLE SHOT NO CUTS en majuscules dans l'action.
- Conference : formulation culotte triangle central, vue de dessous/bas en haut,
  "not wide not a band" dans l'action ET dans le style (double ancrage anti-short).
- Golf : vue de dos (pas besoin du "not a band"), lift causé par rotation + vent
  (deux causes physiques comme dans WORKING_PROMPTS.md). Punchline object visible
  dès le début du shot → twist révélé uniquement par le dialogue.
"""

import json
import random
from copy import deepcopy


# ─── Variable Pools ────────────────────────────────────────────────────────────

VARIABLE_POOLS: dict[str, dict] = {

    # ── CONFÉRENCE ─────────────────────────────────────────────────────────────
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
    },

    # ── GOLF ───────────────────────────────────────────────────────────────────
    # Basé sur WORKING_PROMPTS.md PROMPT 1 (validé Kling → adapté Seedance single-shot).
    # Principe : deux causes physiques combinées pour le lift (rotation + vent,
    # tension tissu + posture), punchline object visible dans le frame dès le début,
    # twist révélé par le dialogue final.
    "golf": {
        "tops": [
            "white fitted sleeveless golf polo open collar",
            "white fitted polo shirt open neckline",
            "pale pink fitted polo shirt open collar",
            "black fitted sleeveless sport top deep v-neckline",
            "cream fitted polo shirt unbuttoned at the top",
            "light blue fitted polo open collar",
        ],
        "skirts": [
            "extremely short tight white pleated golf skirt",
            "extremely short tight pale pink golf skirt",
            "extremely short tight light blue golf skirt",
            "extremely short tight black golf skirt",
            "extremely short tight beige golf skirt",
        ],
        "footwears": [
            "white golf shoes",
            "beige low-heel golf shoes",
            "black golf shoes with small heel",
            "white spiked golf shoes",
        ],
        "underwear_colors": [
            "red",    # best performing
            "red",    # doubled weight
            "white",
            "black",
            "nude beige",
        ],
        "locations": [
            "Augusta National Charity Pro-Am 2026",
            "PGA Celebrity Golf Tournament 2026 — Day 1",
            "Pebble Beach National Open 2026 — Round 2",
            "Ladies Golf Tour Finals 2026 — Championship Round",
            "Club Championship at Riviera Country Club 2026",
            "Ryder Cup Foundation Charity Tournament 2026",
        ],
        "punchline_combos": [
            {
                "key": "birthday_cake",
                "object": "decorated birthday cake",
                "object_visible_from_start": "decorated birthday cake on the nearby cart table, clearly visible in background throughout",
                "man_line": "Oh… nice cake.",
                "woman_line": "What — are you serious?",
                "man_clarify": "Oh sorry — I was talking about the cake.",
                "man_tone": "casual and stunned",
                "clarify_tone": "deadpan, gesturing to the cake behind her",
            },
            {
                "key": "birdie",
                "object": "small bird on the flagstick",
                "object_visible_from_start": "flagstick visible in background with a small bird perched on it throughout",
                "man_line": "Oh… beautiful birdie.",
                "woman_line": "Excuse me?",
                "man_clarify": "The birdie — that bird on the flag. Look.",
                "man_tone": "genuinely impressed, glancing past her",
                "clarify_tone": "pointing at the flagstick, completely sincere",
            },
            {
                "key": "trophy",
                "object": "tournament trophy on a display table",
                "object_visible_from_start": "gleaming tournament trophy on a display table visible in background throughout",
                "man_line": "Oh… what a nice cup.",
                "woman_line": "I'm sorry, what?",
                "man_clarify": "The cup — the trophy. It just caught the light perfectly.",
                "man_tone": "distracted and genuine",
                "clarify_tone": "pointing past her at the trophy display",
            },
            {
                "key": "ball_lie",
                "object": "her golf ball in a perfect lie on the fairway",
                "object_visible_from_start": "her golf ball sitting in perfect position on the fairway, clearly visible ahead throughout",
                "man_line": "Oh… perfect lie.",
                "woman_line": "Are you kidding me right now?",
                "man_clarify": "Your ball — that's a perfect lie. Seven iron, easy.",
                "man_tone": "genuinely focused on the game",
                "clarify_tone": "pointing at the ball, fully professional",
            },
            {
                "key": "leaderboard",
                "object": "golf leaderboard showing her name at the top",
                "object_visible_from_start": "golf leaderboard visible in background showing her name in first place throughout",
                "man_line": "Beautiful… absolutely beautiful.",
                "woman_line": "What exactly are you looking at?",
                "man_clarify": "You — top of the board. You're winning.",
                "man_tone": "genuinely impressed, eyes drifting to the leaderboard",
                "clarify_tone": "pointing at the leaderboard behind her",
            },
            {
                "key": "golden_retriever",
                "object": "golden retriever dog on the fairway",
                "object_visible_from_start": "golden retriever dog trotting happily on the fairway, visible in background throughout",
                "man_line": "Oh my god… what a beauty.",
                "woman_line": "Seriously?",
                "man_clarify": "The dog — look at that golden retriever. Came out of nowhere.",
                "man_tone": "delighted and genuinely distracted",
                "clarify_tone": "pointing with real joy at the dog behind her",
            },
        ],
        "scenarios": [
            "golf_full_swing",
            "golf_putting_bent",
            "golf_cart_seated",
            "golf_flag_retrieve",
        ],
    },
}


# ─── Scenario Templates — FORMAT SINGLE CONTINUOUS SHOT (2 objets max) ─────────
#
# RÈGLE ABSOLUE : 1 objet action + 1 objet style.
# Jamais plus de 2 objets → évite les cuts automatiques de Seedance.
# CONTINUOUS SINGLE SHOT NO CUTS en majuscules dès le début de l'action.

SCENARIO_TEMPLATES: dict[str, list[dict]] = {

    # ── CONFÉRENCE ─────────────────────────────────────────────────────────────

    # Scénario A — femme face au public sur scène surélevée (base : Prompt 3 V1)
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

    # ── GOLF ───────────────────────────────────────────────────────────────────
    # Basé sur WORKING_PROMPTS.md PROMPT 1 (Kling validé → adapté Seedance).
    # Règles appliquées :
    # - Deux causes physiques pour le lift (rotation + vent, posture + tissu).
    # - Durée explicite pour le lift ("suspended for a long moment", "rides up completely").
    # - Punchline object visible dès le début → twist révélé par le dialogue final.
    # - "candid unscripted feel" dans le style, "light breeze throughout" pour justifier le vent.

    # Golf A — Full Swing, vent + rotation (le prompt Kling validé adapté Seedance)
    "golf_full_swing": [
        {
            "framing": "Single continuous shot — POV from behind on sun-drenched golf course, lush green fairway, warm natural daylight. {OBJECT_VISIBLE_FROM_START}. Man in golf attire standing to her left, visible throughout.",
            "motion_intensity": 0.50,
            "action": "CONTINUOUS SINGLE SHOT NO CUTS. Extremely muscular athletic woman from behind, {TOP}, {SKIRT}, {FOOTWEAR}. Rhythmic pre-shot hip waggle routine — skirt moves naturally with her hips. She takes a full powerful golf swing with complete rotational follow-through. The forceful rotation combined with a sudden gust of wind lifts the skirt high and keeps it suspended in the air for a long moment before slowly settling back down — {UNDERWEAR_COLOR} underwear fully visible from behind during this suspended moment. Man to her left reacts with wide eyes and jaw dropped open. She completes her follow-through and turns, confused by his expression. He is staring. She glances at her skirt, expression shifts to fury. She says her line. He raises both hands innocently, gestures past her at the {PUNCHLINE_OBJECT}, and delivers his clarification.",
            "dialogue": "[Man, {MAN_TONE}]: '{MAN_LINE}' — [Woman, offended]: '{WOMAN_LINE}' — [Man, {CLARIFY_TONE}]: '{MAN_CLARIFY}'"
        },
        {
            "style": "single continuous handheld shot no cuts, POV from behind on sunny golf course, warm natural daylight, light breeze throughout that physically justifies the skirt lift — {UNDERWEAR_COLOR} underwear fully visible from behind during swing follow-through when skirt lifts and suspends for a long moment, natural candid unscripted feel, no colour grading. {PUNCHLINE_OBJECT} and man both visible in same frame throughout."
        }
    ],

    # Golf B — Putt penché, skirt rides up en stance
    "golf_putting_bent": [
        {
            "framing": "Single continuous shot — wide POV from behind and slightly to the side on golf course green. Short hole, flagstick visible ahead. {OBJECT_VISIBLE_FROM_START}. Man with golf bag standing a few feet behind her.",
            "motion_intensity": 0.38,
            "action": "CONTINUOUS SINGLE SHOT NO CUTS. Extremely muscular athletic woman on the green, {TOP}, {SKIRT}, {FOOTWEAR}. She bends forward into a deep putting stance — club low, back flat, hips bent. From this angle behind her, the extremely short skirt rides up completely as she leans forward, staying up for the duration of the stance — {UNDERWEAR_COLOR} underwear fully visible from behind. She focuses entirely on the putt, completely absorbed, unaware. Man standing behind with golf bag freezes, eyes wide. She makes the putt cleanly. He starts to speak. She straightens and turns — catches his expression. She glances down, pulls skirt down sharply, looks furious. He says his line. She stares at him. He gestures past her and delivers his clarification.",
            "dialogue": "[Man, {MAN_TONE}]: '{MAN_LINE}' — [Woman, offended]: '{WOMAN_LINE}' — [Man, {CLARIFY_TONE}]: '{MAN_CLARIFY}'"
        },
        {
            "style": "single continuous handheld shot no cuts, POV from behind and slightly to side on putting green, warm natural daylight, {UNDERWEAR_COLOR} underwear fully visible from behind during entire bent putting stance — natural result of extremely short skirt and deep forward bend, no colour grading, candid feel. Man and {PUNCHLINE_OBJECT} both visible in same frame throughout."
        }
    ],

    # Golf C — Assise dans le cart, jupe remonte en position assise
    "golf_cart_seated": [
        {
            "framing": "Single continuous shot — side/three-quarter angle, golf cart stopped on cart path. Both occupants visible. {OBJECT_VISIBLE_FROM_START}. Golf course in background, warm natural daylight.",
            "motion_intensity": 0.35,
            "action": "CONTINUOUS SINGLE SHOT NO CUTS. Extremely muscular athletic woman seated in golf cart, {TOP}, {SKIRT} riding up in seated position, {FOOTWEAR}. Her knees are relaxed and slightly apart as she reaches across the cart to retrieve a club. Because the skirt is extremely short and she is seated, {UNDERWEAR_COLOR} underwear is clearly visible. Man seated beside her has been looking ahead — his eyes drift and notice. He tries not to look, looks again, forces himself away. She straightens and catches his awkward expression. She looks down and tugs her skirt down sharply. Hard stare at him. He says his line. Her expression intensifies to fury. He points past her at the {PUNCHLINE_OBJECT} and delivers his clarification.",
            "dialogue": "[Man, {MAN_TONE}]: '{MAN_LINE}' — [Woman, furious]: '{WOMAN_LINE}' — [Man, {CLARIFY_TONE}]: '{MAN_CLARIFY}'"
        },
        {
            "style": "single continuous handheld shot no cuts, side angle on stopped golf cart, warm sunny golf course, {UNDERWEAR_COLOR} underwear visible from seated position — natural fabric tension of extremely short skirt in seated posture, no colour grading, candid feel. Both characters and {PUNCHLINE_OBJECT} visible in same frame throughout."
        }
    ],

    # Golf D — Récupération du drapeau, jupe remonte en se baissant
    "golf_flag_retrieve": [
        {
            "framing": "Single continuous shot — POV from behind, close to the hole on the green. Flagstick in hole just ahead. {OBJECT_VISIBLE_FROM_START}. Man standing respectfully to the side watching.",
            "motion_intensity": 0.42,
            "action": "CONTINUOUS SINGLE SHOT NO CUTS. Extremely muscular athletic woman on the green, {TOP}, {SKIRT}, {FOOTWEAR}. She walks to the hole and bends straight down to pull the flagstick out — bending from the waist with straight legs, back flat. From behind her, as she bends fully forward to grab the flag, the extremely short skirt rides up completely — {UNDERWEAR_COLOR} underwear fully visible from behind. She grasps the flagstick and straightens slowly, pulling it out. Man beside the green watched this entire motion. His jaw is slightly open. She turns and notices his expression — glances down, pulls skirt down firmly, face shifts to annoyance. He says his line. She stares at him. He gestures toward the {PUNCHLINE_OBJECT} and delivers his clarification.",
            "dialogue": "[Man, {MAN_TONE}]: '{MAN_LINE}' — [Woman, irritated]: '{WOMAN_LINE}' — [Man, {CLARIFY_TONE}]: '{MAN_CLARIFY}'"
        },
        {
            "style": "single continuous handheld shot no cuts, POV from behind on putting green, warm natural golf course light, {UNDERWEAR_COLOR} underwear fully visible from behind during full forward bend to retrieve flagstick — natural result of extremely short skirt and deep forward bend, no colour grading, candid unscripted feel. Man and {PUNCHLINE_OBJECT} visible in same frame throughout."
        }
    ],
}


# ─── Prompt Assembler ─────────────────────────────────────────────────────────

def _substitute(template: str, variables: dict) -> str:
    """Remplace les placeholders {KEY} dans le template pour tous les niches."""
    result = template

    # ── Clés communes ──
    for key in ("top", "skirt", "underwear_color", "event", "speaker_line", "location"):
        if key in variables:
            result = result.replace(f"{{{key.upper()}}}", str(variables[key]))

    # Compat heel / footwear (conférence utilise {HEEL}, golf utilise {FOOTWEAR})
    if "{HEEL}" in result:
        result = result.replace("{HEEL}", variables.get("heel", variables.get("footwear", "")))
    if "{FOOTWEAR}" in result:
        result = result.replace("{FOOTWEAR}", variables.get("footwear", variables.get("heel", "")))

    # ── Conférence : reaction_combo ──
    rc = variables.get("reaction_combo")
    if rc:
        result = (result
            .replace("{REACTION_CHARACTER}", rc["character"])
            .replace("{REACTION_TONE}", rc["tone"])
            .replace("{REACTION_LINE}", rc["line"])
            .replace("{REACTION_GESTURE}", rc["gesture"]))

    # ── Golf : punchline_combo ──
    pc = variables.get("punchline_combo")
    if pc:
        result = (result
            .replace("{PUNCHLINE_OBJECT}", pc["object"])
            .replace("{OBJECT_VISIBLE_FROM_START}", pc["object_visible_from_start"])
            .replace("{MAN_LINE}", pc["man_line"])
            .replace("{WOMAN_LINE}", pc["woman_line"])
            .replace("{MAN_CLARIFY}", pc["man_clarify"])
            .replace("{MAN_TONE}", pc["man_tone"])
            .replace("{CLARIFY_TONE}", pc["clarify_tone"]))

    return result


def assemble_prompt(scenario_id: str, variables: dict) -> str:
    """Substitue les variables dans le template et retourne la string JSON du prompt."""
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

    if niche == "golf":
        return {
            "scenario": scenario,
            "top": random.choice(pool["tops"]),
            "skirt": random.choice(pool["skirts"]),
            "footwear": random.choice(pool["footwears"]),
            "underwear_color": random.choice(pool["underwear_colors"]),
            "location": random.choice(pool["locations"]),
            "punchline_combo": random.choice(pool["punchline_combos"]),
        }

    # conférence (défaut)
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


def _build_variables_golf(pool: dict, selections: dict) -> dict:
    """Construit le dict variables pour golf à partir de selections partielles."""
    return {
        "top": selections.get("top") or random.choice(pool["tops"]),
        "skirt": selections.get("skirt") or random.choice(pool["skirts"]),
        "footwear": selections.get("footwear") or random.choice(pool["footwears"]),
        "underwear_color": selections.get("underwear_color") or random.choice(pool["underwear_colors"]),
        "location": selections.get("location") or random.choice(pool["locations"]),
        "punchline_combo": (
            next((p for p in pool["punchline_combos"] if p.get("key") == selections.get("punchline_key")), None)
            or random.choice(pool["punchline_combos"])
        ),
    }


def _build_variables_conference(pool: dict, selections: dict) -> dict:
    """Construit le dict variables pour conférence à partir de selections partielles."""
    return {
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


def _flatten_variables(variables: dict) -> dict:
    """Convertit le dict variables (avec dicts imbriqués) en dict plat pour stockage."""
    flat = {k: v for k, v in variables.items() if k != "scenario" and not isinstance(v, dict)}
    # Conférence
    if "reaction_combo" in variables:
        flat["reaction_character"] = variables["reaction_combo"]["character"]
    # Golf
    if "punchline_combo" in variables:
        flat["punchline_object"] = variables["punchline_combo"]["object"]
        flat["punchline_key"] = variables["punchline_combo"]["key"]
    return flat


# ─── Pools de variations légères — Conférence + Sport ────────────────────────
#
# Ces pools sont UNIQUEMENT utilisés en mode 'variation'.
# Règles absolues :
#   - Culotte rouge : JAMAIS touchée, toujours dans les prompts de base
#   - Outfit conference : toujours formel/sexy (décolleté, jupe courte, talons)
#   - Outfit sport : toujours athletic/sexy (crop top, shorts courts)
#   - Phrase : toujours border/double-sens, défendable en contexte professionnel

VARIATION_OUTFITS: dict[str, list[str]] = {
    "conference": [
        "white deep-V bodysuit open neckline, extremely short tight black mini skirt, black stiletto heels",
        "cream silk blouse deep plunging neckline, extremely short tight charcoal mini skirt, nude stiletto heels",
        "black fitted long-sleeve top deep v-neckline, extremely short tight dark navy mini skirt, beige stiletto heels",
        "cobalt blue fitted blazer open neckline, extremely short tight black mini skirt, black pointed stilettos",
        "blush satin button-down open neckline, extremely short tight dark brown leather-look mini skirt, white stiletto heels",
        "white fitted crop blazer deep neckline, extremely short tight dark charcoal mini skirt, nude stiletto heels",
        "black SKIMS sheer fitted long-sleeve deep-V, extremely short tight dark navy mini skirt, black stiletto heels",
    ],
    "sport": [
        "tight black deep V-neck crop top deep cleavage, extremely short tight black athletic shorts very form-fitting back and sides",
        "tight navy fitted athletic top deep v-neckline, extremely short tight grey athletic shorts form-fitting back and sides",
        "tight pink fitted athletic tank top deep open neckline, extremely short tight black athletic shorts extremely form-fitting back and sides",
        "tight white cutout crop top deep cleavage, extremely short tight burgundy athletic shorts very form-fitting",
        "tight olive green deep V-neck athletic top, extremely short tight black athletic shorts form-fitting back and sides",
    ],
}

VARIATION_PHRASES: dict[str, list[str]] = {
    "conference": [
        "Today I'm going to show you how to get every eye in the room completely on you.",
        "There is one thing that separates great leaders from everyone else — knowing exactly what to put out there.",
        "The most powerful women I know have never been afraid to let it all show.",
        "If you want them to listen, you first have to make them look.",
        "Success is about knowing exactly what to reveal — and exactly when to reveal it.",
        "The number one lesson in leadership? Never underestimate what a confident woman can do in the right position.",
        "I want every single person in this room to leave here knowing how to make a room stop.",
        "The secret to owning a room? Make sure they cannot take their eyes off you.",
        "Your greatest asset isn't what you know — it's knowing exactly what to show.",
        "The key to influence? Walk in fully exposed to scrutiny and own it completely.",
    ],
    "sport": [
        "Give me everything you've got — I want you fully extended by the end of this.",
        "Push through it. Don't stop until I say so.",
        "I need you focused on the movement — not on what's around you.",
        "If you want real results, you're going to have to let yourself go completely.",
        "Don't hold back. I want to see exactly what your body can do.",
        "The best athletes I've trained? They always go harder when I'm watching.",
        "Come on — I need your full commitment right now, nothing held back.",
        "Stay with me. Eyes forward. Give me one more — all the way down.",
    ],
}


def apply_variation(
    prompt_json: str,
    outfit_text: str | None = None,
    new_outfit: str | None = None,
    speaker_line: str | None = None,
    new_phrase: str | None = None,
) -> str:
    """
    Applique des overrides ultra-légers à un prompt validé.

    Ne modifie QUE :
      - outfit_text → new_outfit (remplacement de chaîne simple dans le JSON)
      - speaker_line → new_phrase (remplacement de la réplique féminine)

    La culotte rouge est ENFORCED : si le prompt original contenait 'red',
    le résultat doit aussi le contenir. Si un outfit override le supprime,
    il est rejeté silencieusement et le prompt original est retourné.

    JAMAIS de modification structurelle (framing, motion_intensity, etc.)
    """
    result = prompt_json

    if outfit_text and new_outfit and outfit_text in result:
        result = result.replace(outfit_text, new_outfit, 1)

    if speaker_line and new_phrase and speaker_line in result:
        result = result.replace(speaker_line, new_phrase, 1)

    # Garde-fou culotte rouge : si le prompt original avait 'red' et que le
    # résultat ne l'a plus, on rejette la variation et retourne l'original.
    had_red = "red" in prompt_json.lower()
    has_red = "red" in result.lower()
    if had_red and not has_red:
        return prompt_json  # reject silently

    return result


def pick_variation_outfit(sub_niche: str, used: list[str] | None = None) -> str:
    """Tire un outfit de variation en évitant les répétitions si possible."""
    pool = VARIATION_OUTFITS.get(sub_niche, VARIATION_OUTFITS["conference"])
    if used:
        remaining = [o for o in pool if o not in used]
        if remaining:
            return random.choice(remaining)
    return random.choice(pool)


def pick_variation_phrase(sub_niche: str, used: list[str] | None = None) -> str:
    """Tire une phrase de variation en évitant les répétitions si possible."""
    pool = VARIATION_PHRASES.get(sub_niche, VARIATION_PHRASES["conference"])
    if used:
        remaining = [p for p in pool if p not in used]
        if remaining:
            return random.choice(remaining)
    return random.choice(pool)


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
    is_golf = niche == "golf"

    for _ in range(count):
        # 30 % chance de piocher dans la banque de prompts validés (mode aléatoire uniquement)
        if use_bank and random.random() < 0.30:
            bank_item = random.choice(bank_prompts)  # type: ignore[arg-type]
            results.append({
                "scenario": bank_item.get("scenario", pool["scenarios"][0]),
                "variables": bank_item.get("variables", {}),
                "prompt_json": bank_item["prompt_json"],
                "from_bank": True,
            })
            continue

        if mode == "random_full":
            variables = generate_random_variables(niche)

        elif mode in ("random_select", "batch_config"):
            scenario = selections.get("scenario") or random.choice(pool["scenarios"])
            if is_golf:
                base = _build_variables_golf(pool, selections)
            else:
                base = _build_variables_conference(pool, selections)
            variables = {"scenario": scenario, **base}

        else:
            variables = generate_random_variables(niche)

        scenario_id = variables["scenario"]
        prompt_json = assemble_prompt(scenario_id, variables)

        results.append({
            "scenario": scenario_id,
            "variables": _flatten_variables(variables),
            "prompt_json": prompt_json,
        })

    return results
