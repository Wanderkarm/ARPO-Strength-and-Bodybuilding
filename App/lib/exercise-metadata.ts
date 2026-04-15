export interface MuscleBreakdown {
  muscle: string;
  percentage: number;
}

export interface ExerciseMetadata {
  muscleBreakdown?: MuscleBreakdown[];
  instructions?: string[];
}

export const EXERCISE_METADATA: Record<string, ExerciseMetadata> = {
  "Smith Machine Bench Press": {
    muscleBreakdown: [
      { muscle: "Chest", percentage: 64 },
      { muscle: "Triceps", percentage: 22 },
      { muscle: "Shoulders", percentage: 10 },
      { muscle: "Abs", percentage: 4 },
    ],
    instructions: [
      "Start by placing a flat bench in the middle of a smith machine so that the bar is in line with the middle of your chest.",
      "Lie down with your back flat on the bench and grab the bar with a shoulder-width grip.",
      "Unlatch the bar, then slowly lower it down towards your chest until it barely touches.",
      "Hold this position for a count then return back up to the start.",
    ],
  },

  "Medium Grip Bench Press": {
    muscleBreakdown: [
      { muscle: "Chest", percentage: 65 },
      { muscle: "Triceps", percentage: 22 },
      { muscle: "Shoulders", percentage: 13 },
    ],
    instructions: [
      "Lie flat on a bench and grip the barbell just outside shoulder-width.",
      "Unrack the bar and hold it directly above your chest with arms fully extended.",
      "Lower the bar in a controlled arc until it lightly touches your mid-chest.",
      "Press the bar back up explosively to the starting position, keeping your feet flat on the floor.",
    ],
  },

  "Dumbbell Flat Bench Press": {
    muscleBreakdown: [
      { muscle: "Chest", percentage: 60 },
      { muscle: "Triceps", percentage: 24 },
      { muscle: "Shoulders", percentage: 16 },
    ],
    instructions: [
      "Sit on the edge of a flat bench holding a dumbbell on each thigh. Use your thighs to kick the weights up as you lie back.",
      "Hold the dumbbells at chest level with a neutral or pronated grip, elbows at roughly 45 degrees from your torso.",
      "Press both dumbbells up until your arms are fully extended, touching the weights together at the top.",
      "Lower them slowly and under control back to the starting position.",
    ],
  },

  "High Bar Squat": {
    muscleBreakdown: [
      { muscle: "Quads", percentage: 55 },
      { muscle: "Glutes", percentage: 30 },
      { muscle: "Hamstrings", percentage: 10 },
      { muscle: "Abs", percentage: 5 },
    ],
    instructions: [
      "Position the barbell high on your upper traps, just below the base of your neck. Grip the bar just outside shoulder-width.",
      "Step back from the rack, feet shoulder-width apart with toes pointed slightly out.",
      "Take a deep breath, brace your core, and push your knees out as you descend until your thighs are at least parallel to the floor.",
      "Drive through your heels to stand back up, keeping your chest tall and your back neutral throughout.",
    ],
  },

  "Barbell Hip Thrust": {
    muscleBreakdown: [
      { muscle: "Glutes", percentage: 70 },
      { muscle: "Hamstrings", percentage: 20 },
      { muscle: "Abs", percentage: 10 },
    ],
    instructions: [
      "Sit on the floor with your upper back against a bench. Roll the barbell over your hips, using a pad for comfort.",
      "Plant your feet flat on the floor, about hip-width apart, with knees bent at roughly 90 degrees.",
      "Drive through your heels and squeeze your glutes hard to thrust your hips up until your body forms a straight line from knees to shoulders.",
      "Lower your hips back down in a controlled manner and repeat without losing tension.",
    ],
  },

  "Barbell Curl": {
    muscleBreakdown: [
      { muscle: "Biceps", percentage: 72 },
      { muscle: "Forearms", percentage: 18 },
      { muscle: "Shoulders", percentage: 10 },
    ],
    instructions: [
      "Stand upright holding a barbell with an underhand (supinated) grip, hands shoulder-width apart, arms fully extended.",
      "Keeping your elbows pinned at your sides, curl the bar up toward your shoulders by contracting your biceps.",
      "Squeeze hard at the top and slowly lower the bar back to the start under full control.",
      "Avoid swinging your torso — all movement should come from the elbow joint.",
    ],
  },

  "Close Grip Bench Press": {
    muscleBreakdown: [
      { muscle: "Triceps", percentage: 60 },
      { muscle: "Chest", percentage: 28 },
      { muscle: "Shoulders", percentage: 12 },
    ],
    instructions: [
      "Lie on a flat bench and grip the barbell with hands about 12–16 inches apart, elbows tucked close to your body.",
      "Unrack the bar and hold it directly over your lower chest.",
      "Lower the bar in a straight line to your lower chest, keeping elbows tight against your sides.",
      "Press the bar back up forcefully to the starting position, focusing on squeezing your triceps at the top.",
    ],
  },

  "Lying Leg Curl": {
    muscleBreakdown: [
      { muscle: "Hamstrings", percentage: 75 },
      { muscle: "Calves", percentage: 15 },
      { muscle: "Glutes", percentage: 10 },
    ],
    instructions: [
      "Lie face down on the leg curl machine and position the pad just above your heels.",
      "Grip the handles and keep your hips flat on the pad throughout the movement.",
      "Curl your heels toward your glutes as far as possible, squeezing your hamstrings hard at the top.",
      "Slowly lower the weight back to the starting position without letting the plates touch between reps.",
    ],
  },

  // ── BACK exercises ──────────────────────────────────────────────────────────

  "Bodyweight Pull Up": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 70 },
      { muscle: "Biceps", percentage: 20 },
      { muscle: "Shoulders", percentage: 10 },
    ],
    instructions: [
      "Grip the overhead bar slightly wider than shoulder-width with an overhand grip.",
      "Hang with your arms fully extended and pull your shoulders down and back.",
      "Engage your lats and pull your body up until your chin is over the bar.",
      "Lower yourself under complete control back to a dead hang.",
    ],
  },

  "Wide Grip Pulldown": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 75 },
      { muscle: "Biceps", percentage: 20 },
      { muscle: "Shoulders", percentage: 5 },
    ],
    instructions: [
      "Adjust the knee pad so your legs are locked in. Grip the wide bar with an overhand grip.",
      "Lean back slightly and pull the bar down toward your upper chest.",
      "Squeeze your shoulder blades together at the bottom.",
      "Allow the bar to return slowly to the starting position, fully stretching your lats.",
    ],
  },

  "Normal Grip Pulldown": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 75 },
      { muscle: "Biceps", percentage: 20 },
      { muscle: "Shoulders", percentage: 5 },
    ],
    instructions: [
      "Adjust the knee pad so your legs are locked in. Grip the bar at about shoulder-width.",
      "Lean back slightly and pull the bar down toward your upper chest.",
      "Squeeze your shoulder blades together at the bottom.",
      "Allow the bar to return slowly to the starting position, fully stretching your lats.",
    ],
  },

  "Close Grip Pulldown": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 72 },
      { muscle: "Biceps", percentage: 24 },
      { muscle: "Shoulders", percentage: 4 },
    ],
    instructions: [
      "Use a close-grip or neutral-grip attachment. Sit with your knees locked under the pad.",
      "Lean back very slightly and initiate the pull by depressing your shoulder blades.",
      "Pull the bar to your upper chest, driving your elbows down and back.",
      "Slowly return to the starting position under full control.",
    ],
  },

  "Underhand Pulldown": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 68 },
      { muscle: "Biceps", percentage: 28 },
      { muscle: "Shoulders", percentage: 4 },
    ],
    instructions: [
      "Grip the bar with a supinated (palms facing you) grip at roughly shoulder-width.",
      "Sit down with your knees secured under the pad, torso upright.",
      "Pull the bar toward your upper chest while keeping your elbows tight to your body.",
      "Return the bar under control to a full stretch at the top.",
    ],
  },

  "Barbell Bent Over Row": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 70 },
      { muscle: "Biceps", percentage: 20 },
      { muscle: "Lower Back", percentage: 10 },
    ],
    instructions: [
      "Bend at the hips until your torso is nearly parallel to the floor, keeping your back flat.",
      "Grip the barbell with an overhand grip, slightly wider than shoulder-width.",
      "Pull the barbell toward your lower ribs, squeezing your middle and upper back hard.",
      "Lower the barbell under control back to full arm extension.",
    ],
  },

  "Dumbbell Bent Over Row": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 68 },
      { muscle: "Biceps", percentage: 22 },
      { muscle: "Lower Back", percentage: 10 },
    ],
    instructions: [
      "Hold a dumbbell in each hand and hinge at the hips until your torso is roughly parallel to the floor.",
      "Keep your core braced and your back flat throughout the movement.",
      "Row the dumbbells up toward your hips, leading with your elbows.",
      "Lower both dumbbells slowly back to full arm extension.",
    ],
  },

  "Seated Cable Row": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 70 },
      { muscle: "Biceps", percentage: 20 },
      { muscle: "Shoulders", percentage: 10 },
    ],
    instructions: [
      "Sit at the machine with a narrow or medium grip attachment.",
      "Extend your legs slightly with a soft bend in the knees. Lean back only enough to maintain a flat back.",
      "Pull the handle to your abdomen, squeezing your shoulder blades together intensely.",
      "Slowly return the weight to the start, fully stretching the back without rounding your spine.",
    ],
  },

  // ── SHOULDER exercises ───────────────────────────────────────────────────────

  "Standing Barbell Shoulder Press": {
    muscleBreakdown: [
      { muscle: "Shoulders", percentage: 70 },
      { muscle: "Triceps", percentage: 25 },
      { muscle: "Back", percentage: 5 },
    ],
    instructions: [
      "Stand holding the barbell across your upper chest, gripping it slightly wider than your shoulders.",
      "Take a deep breath, brace your glutes and abs to create stability.",
      "Press the barbell straight overhead until your arms are fully locked.",
      "Lower the bar under control back to the upper chest.",
    ],
  },

  "Dumbbell Shoulder Press": {
    muscleBreakdown: [
      { muscle: "Shoulders", percentage: 70 },
      { muscle: "Triceps", percentage: 25 },
      { muscle: "Back", percentage: 5 },
    ],
    instructions: [
      "Sit on an upright bench with dumbbells resting on your shoulders.",
      "Engage your core and press the dumbbells straight up until your elbows are extended.",
      "Do not lock your elbows out at the top to maintain tension.",
      "Lower the dumbbells slowly back to the starting position.",
    ],
  },

  "Dumbbell Lateral Raise": {
    muscleBreakdown: [
      { muscle: "Shoulders", percentage: 100 },
    ],
    instructions: [
      "Hold a pair of light dumbbells at your sides with a slight bend in the elbows.",
      "Lean forward slightly and lift the dumbbells out to your sides until they reach shoulder height.",
      "Keep your hands level with or slightly below your elbows at the top.",
      "Lower the dumbbells slowly to your sides.",
    ],
  },

  "Cable Facepull": {
    muscleBreakdown: [
      { muscle: "Shoulders", percentage: 60 },
      { muscle: "Traps", percentage: 30 },
      { muscle: "Biceps", percentage: 10 },
    ],
    instructions: [
      "Set a cable pulley to eye height with a rope attachment.",
      "Step back and hold the rope with a neutral grip.",
      "Pull the rope toward your face, attempting to pull the ends of the rope wide past your ears.",
      "Squeeze your rear delts and upper back hard at the top before returning to the start.",
    ],
  },

  "Seated Calf Raise": {
    muscleBreakdown: [
      { muscle: "Calves", percentage: 80 },
      { muscle: "Hamstrings", percentage: 20 },
    ],
    instructions: [
      "Sit on a calf raise machine with the pads resting just above your knees. Position your toes on the platform with heels hanging off the edge.",
      "Lower your heels as far as possible to achieve a full stretch at the bottom.",
      "Press up onto your toes as high as you can, squeezing your calf muscles hard at the top.",
      "Control the descent back down and repeat for the target number of reps.",
    ],
  },

  "Dumbbell Hammer Curl": {
    muscleBreakdown: [
      { muscle: "Biceps", percentage: 60 },
      { muscle: "Forearms", percentage: 40 },
    ],
    instructions: [
      "Stand holding a dumbbell in each hand with a neutral grip (palms facing each other).",
      "Keep your elbows pinned to your sides and curl the weights up toward your shoulders.",
      "Pause and squeeze at the top, focusing on the brachialis and forearms.",
      "Lower the dumbbells slowly to full extension.",
    ],
  },

  "Lying Triceps Extension (Skullcrusher)": {
    muscleBreakdown: [{ muscle: "Triceps", percentage: 100 }],
    instructions: [
      "Lie flat on a bench holding an EZ-bar or barbell with a close, overhand grip.",
      "Press the bar straight up, then let your elbows drift slightly back toward your head.",
      "Lower the bar under control toward your forehead by bending only at the elbows.",
      "Extend your arms forcefully to return the bar to the starting position.",
    ],
  },

  "Dumbbell Skull Crusher": {
    muscleBreakdown: [{ muscle: "Triceps", percentage: 100 }],
    instructions: [
      "Lie flat on a bench holding a dumbbell in each hand with a close, overhand grip.",
      "Press the dumbbells straight up, then let your elbows drift slightly back toward your head.",
      "Lower the dumbbells under control toward your forehead by bending only at the elbows.",
      "Extend your arms forcefully to return to the starting position.",
    ],
  },

  "Cable Tricep Pushdown": {
    muscleBreakdown: [{ muscle: "Triceps", percentage: 100 }],
    instructions: [
      "Stand facing a cable station with a rope or straight bar attachment set high.",
      "Tuck your elbows tightly against your ribs and lean slightly forward.",
      "Push the attachment down until your arms are fully extended, pulling the rope apart at the bottom if using one.",
      "Control the weight back up until your forearms are at least parallel to the floor.",
    ],
  },

  "Standing Calf Raise": {
    muscleBreakdown: [{ muscle: "Calves", percentage: 100 }],
    instructions: [
      "Stand on the edge of a step or calf raise block with the balls of your feet securely planted.",
      "Lower your heels as far down as possible to achieve a deep stretch in the calves.",
      "Drive up onto your toes as high as possible, squeezing the calves hard at the top.",
      "Hold the top contraction for a second before slowly lowering back into the stretch.",
    ],
  },

  "Barbell Shrug": {
    muscleBreakdown: [
      { muscle: "Traps", percentage: 60 },
      { muscle: "Shoulders", percentage: 40 },
    ],
    instructions: [
      "Stand holding a barbell in front of you with an overhand grip, hands just outside your thighs.",
      "Keep your arms straight and shrug your shoulders straight up toward your ears.",
      "Squeeze your traps forcefully at the top of the movement.",
      "Lower the bar slowly back to the resting position.",
    ],
  },

  "Machine Crunch": {
    muscleBreakdown: [{ muscle: "Abs", percentage: 100 }],
    instructions: [
      "Sit in the ab machine and securely lock your feet and arms into the pads.",
      "Keep your head neutral and engage your core to curl your torso forward.",
      "Squeeze your abdominals hard at the bottom of the movement.",
      "Slowly resist the weight as you return to the upright starting position.",
    ],
  },

  "Cable Crunch": {
    muscleBreakdown: [{ muscle: "Abs", percentage: 100 }],
    instructions: [
      "Kneel below a high cable pulley equipped with a rope attachment.",
      "Hold the rope on either side of your head and lock your hips in place.",
      "Crunch your torso downward, bringing your elbows toward your knees.",
      "Squeeze your abs tight, then slowly let the cable pull your torso back up without extending your lower back.",
    ],
  },

  "Hanging Leg Raise": {
    muscleBreakdown: [{ muscle: "Abs", percentage: 100 }],
    instructions: [
      "Hang from a pull-up bar with an overhand grip, keeping your core braced and legs straight.",
      "Without using momentum, raise your legs by flexing your lower spine and hips.",
      "Bring your legs up as high as you can control, aiming for at least parallel to the floor.",
      "Lower your legs slowly and strictly to avoid swinging.",
    ],
  },

  // ── Bodyweight ───────────────────────────────────────────────────────────────

  "Bodyweight Chin Up": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 60 },
      { muscle: "Biceps", percentage: 40 },
    ],
    instructions: [
      "Grip the bar with an underhand grip (palms facing you), about shoulder-width apart.",
      "Hang with your arms fully extended and your core braced.",
      "Pull your body up until your chin clears the bar, driving your elbows down toward your hips.",
      "Lower yourself under control back to a dead hang.",
    ],
  },

  "Bodyweight Diamond Push Up": {
    muscleBreakdown: [
      { muscle: "Triceps", percentage: 70 },
      { muscle: "Chest", percentage: 20 },
      { muscle: "Shoulders", percentage: 10 },
    ],
    instructions: [
      "Assume a push-up position but bring your hands close together under your chest, forming a diamond shape with your thumbs and index fingers.",
      "Keep your core tight and your body in a straight line.",
      "Lower yourself until your chest gently touches your hands, keeping your elbows tucked to your sides.",
      "Press forcefully back up to full arm extension.",
    ],
  },

  "Bodyweight Glute Bridge": {
    muscleBreakdown: [
      { muscle: "Glutes", percentage: 80 },
      { muscle: "Hamstrings", percentage: 20 },
    ],
    instructions: [
      "Lie on your back with your knees bent and feet flat on the floor, hip-width apart.",
      "Brace your core and push your lower back into the floor.",
      "Drive through your heels to raise your hips until your body forms a straight line from knees to shoulders.",
      "Squeeze your glutes hard for a second at the top, then lower under control.",
    ],
  },

  "Bodyweight Incline Push Up": {
    muscleBreakdown: [
      { muscle: "Chest", percentage: 70 },
      { muscle: "Triceps", percentage: 20 },
      { muscle: "Shoulders", percentage: 10 },
    ],
    instructions: [
      "Place your hands slightly wider than shoulder-width on an elevated surface (bench, box, or bar).",
      "Step your feet back so your body forms a straight line and your core is braced.",
      "Lower your chest to the edge of the elevated surface.",
      "Press through your palms to return to the starting position.",
    ],
  },

  "Bodyweight Inverted Row": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 70 },
      { muscle: "Biceps", percentage: 20 },
      { muscle: "Rear Delts", percentage: 10 },
    ],
    instructions: [
      "Set a barbell in a rack at about waist height. Lie underneath it and grab it with an overhand grip.",
      "Keep your body in a straight line from your heels to your head, with your heels on the floor.",
      "Pull your chest up to the bar, squeezing your shoulder blades together.",
      "Lower yourself back down with complete control.",
    ],
  },

  "Bodyweight Lat Pulldown (Band)": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 80 },
      { muscle: "Biceps", percentage: 20 },
    ],
    instructions: [
      "Anchor a resistance band high above you and kneel or sit facing the anchor point.",
      "Grip the band with hands wider than shoulder-width and lean back slightly.",
      "Drive your elbows down and back, pulling the band to your upper chest.",
      "Squeeze your lats hard, then slowly release the tension back to the top.",
    ],
  },

  "Bodyweight Nordic Curl": {
    muscleBreakdown: [
      { muscle: "Hamstrings", percentage: 90 },
      { muscle: "Glutes", percentage: 10 },
    ],
    instructions: [
      "Kneel on a soft pad and have a partner (or a heavy apparatus) securely hold down your ankles.",
      "Keep your torso completely upright and your hips extended.",
      "Slowly lower your body forward toward the floor, using your hamstrings to brake the descent for as long as possible.",
      "Catch yourself with your hands, push back up slightly, and use your hamstrings to pull you back to vertical.",
    ],
  },

  "Bodyweight Pike Push Up": {
    muscleBreakdown: [
      { muscle: "Shoulders", percentage: 80 },
      { muscle: "Triceps", percentage: 20 },
    ],
    instructions: [
      "Start in a standard push-up position, then walk your feet forward and hike your hips up so your body forms an inverted 'V'.",
      "Keep your legs straight and your head in line with your arms.",
      "Lower the top of your head toward the floor, keeping your elbows tucked.",
      "Press back up to the starting 'V' position.",
    ],
  },

  "Bodyweight Push Up": {
    muscleBreakdown: [
      { muscle: "Chest", percentage: 65 },
      { muscle: "Triceps", percentage: 25 },
      { muscle: "Shoulders", percentage: 10 },
    ],
    instructions: [
      "Place your hands firmly on the ground, slightly wider than shoulder-width apart.",
      "Brace your core and squeeze your glutes so your body is a rigid, straight line.",
      "Lower yourself until your chest hovers just above the floor, with elbows tracking at a 45-degree angle.",
      "Press the floor away to lock out your arms.",
    ],
  },

  "Bodyweight Sissy Squat": {
    muscleBreakdown: [{ muscle: "Quads", percentage: 100 }],
    instructions: [
      "Stand with feet shoulder-width apart, holding onto a sturdy upright for balance if needed.",
      "Rise up onto your toes and lean your torso backward while driving your knees forward over your toes.",
      "Lower your hips toward your heels, feeling an extreme stretch in your quads.",
      "Drive through the balls of your feet and squeeze your quads to return to the standing position.",
    ],
  },

  // ── Barbell / Compound ───────────────────────────────────────────────────────

  "Barbell Stiff Leg Deadlift": {
    muscleBreakdown: [
      { muscle: "Hamstrings", percentage: 80 },
      { muscle: "Glutes", percentage: 10 },
      { muscle: "Lower Back", percentage: 10 },
    ],
    instructions: [
      "Stand holding a barbell with a shoulder-width overhand grip, feet hip-width apart.",
      "Keep your knees almost completely locked (stiffer than a traditional RDL).",
      "Hinge at the hips, keeping the bar close to your legs, until you feel an intense stretch in the hamstrings.",
      "Use your hamstrings to pull your torso back up to a standing position.",
    ],
  },

  "Barbell Walking Lunge": {
    muscleBreakdown: [
      { muscle: "Quads", percentage: 50 },
      { muscle: "Glutes", percentage: 40 },
      { muscle: "Hamstrings", percentage: 10 },
    ],
    instructions: [
      "Position a barbell across your upper back and stand with feet hip-width apart.",
      "Take a large step forward with one leg and sink your hips straight down.",
      "Lower until your trailing knee lightly taps the floor and your lead thigh is parallel to the ground.",
      "Drive through your lead foot to step forward into the next rep.",
    ],
  },

  "Conventional Deadlift": {
    muscleBreakdown: [
      { muscle: "Glutes", percentage: 40 },
      { muscle: "Hamstrings", percentage: 30 },
      { muscle: "Lower Back", percentage: 20 },
      { muscle: "Quads", percentage: 10 },
    ],
    instructions: [
      "Stand with your mid-foot exactly under the barbell, feet hip-width apart.",
      "Hinge at the hips and bend your knees to grab the bar just outside your legs.",
      "Flatten your back, pull your chest up, and take the slack out of the bar.",
      "Drive the floor away with your legs and thrust your hips forward to lock out the weight.",
    ],
  },

  "Front Squat": {
    muscleBreakdown: [
      { muscle: "Quads", percentage: 80 },
      { muscle: "Glutes", percentage: 15 },
      { muscle: "Abs", percentage: 5 },
    ],
    instructions: [
      "Rest the barbell across your front delts, securing it with either a clean grip or crossed arms.",
      "Keep your elbows high and your torso completely upright.",
      "Sit straight down between your hips, letting your knees track forward over your toes.",
      "Drive up through your mid-foot, keeping your chest tall to prevent the bar from dropping forward.",
    ],
  },

  "Sumo Deadlift": {
    muscleBreakdown: [
      { muscle: "Glutes", percentage: 50 },
      { muscle: "Quads", percentage: 30 },
      { muscle: "Hamstrings", percentage: 20 },
    ],
    instructions: [
      "Take a wide stance with your toes pointed outward, shins close to the bar.",
      "Drop your hips down and grab the bar with a shoulder-width grip inside your knees.",
      "Keep your chest high, back flat, and wedge your hips close to the bar.",
      "Drive hard through the floor with your legs, squeezing your glutes to lock out.",
    ],
  },

  "Incline Barbell Bench Press": {
    muscleBreakdown: [
      { muscle: "Chest", percentage: 70 },
      { muscle: "Shoulders", percentage: 20 },
      { muscle: "Triceps", percentage: 10 },
    ],
    instructions: [
      "Lie on a bench set to a 30 to 45-degree incline and grip the bar slightly wider than shoulder-width.",
      "Unrack the bar and lower it under control to your upper chest (just below the collarbones).",
      "Keep your elbows tucked at a roughly 45-degree angle from your torso.",
      "Press the bar forcefully upward and slightly back so it finishes over your shoulders.",
    ],
  },

  "Seated Barbell Shoulder Press": {
    muscleBreakdown: [
      { muscle: "Shoulders", percentage: 70 },
      { muscle: "Triceps", percentage: 25 },
      { muscle: "Chest", percentage: 5 },
    ],
    instructions: [
      "Sit on an upright bench with your back firmly supported and unrack the barbell.",
      "Lower the bar to your upper chest/chin level under strict control.",
      "Keep your forearms vertical and press the bar straight up overhead.",
      "Lock out your elbows at the top before beginning the next descent.",
    ],
  },

  // ── Dumbbell ─────────────────────────────────────────────────────────────────

  "Dumbbell Arnold Press": {
    muscleBreakdown: [
      { muscle: "Shoulders", percentage: 80 },
      { muscle: "Triceps", percentage: 20 },
    ],
    instructions: [
      "Sit on an upright bench holding a dumbbell in each hand at upper chest level, palms facing your face.",
      "Press the dumbbells overhead while simultaneously rotating your wrists outward.",
      "Finish the press with your palms facing forward and elbows locked out at the top.",
      "Lower the weights while rotating your wrists back to the starting position.",
    ],
  },

  "Dumbbell Bicep Curl": {
    muscleBreakdown: [{ muscle: "Biceps", percentage: 100 }],
    instructions: [
      "Stand holding a dumbbell in each hand by your sides, palms facing forward.",
      "Keep your elbows pinned to your ribs and curl both weights up toward your shoulders.",
      "Squeeze your biceps hard at the top of the movement.",
      "Lower the dumbbells under strict control back to full arm extension.",
    ],
  },

  "Dumbbell Bulgarian Split Squat": {
    muscleBreakdown: [
      { muscle: "Quads", percentage: 70 },
      { muscle: "Glutes", percentage: 30 },
    ],
    instructions: [
      "Hold a dumbbell in each hand and elevate your rear foot on a bench behind you.",
      "Keep your chest up and descend by dropping your rear knee toward the floor.",
      "Lower until your front thigh is parallel to the ground or deeper.",
      "Drive through the heel of your front foot to return to the starting position.",
    ],
  },

  "Dumbbell Concentration Curl": {
    muscleBreakdown: [{ muscle: "Biceps", percentage: 100 }],
    instructions: [
      "Sit on the edge of a bench holding a dumbbell in one hand, resting that elbow against the inside of your thigh.",
      "Let the dumbbell hang down fully extending your arm.",
      "Curl the weight up toward your shoulder, isolating the bicep completely.",
      "Lower the weight slowly back to a full stretch.",
    ],
  },

  "Dumbbell Fly": {
    muscleBreakdown: [
      { muscle: "Chest", percentage: 90 },
      { muscle: "Shoulders", percentage: 10 },
    ],
    instructions: [
      "Lie on a flat bench holding dumbbells above your chest with a neutral grip (palms facing each other).",
      "Keep a slight bend in your elbows and lower the weights out to your sides in a wide arc.",
      "Descend until you feel a deep stretch across your chest muscles.",
      "Use your pecs to pull the weights back up in the same wide arc, squeezing at the top.",
    ],
  },

  "Dumbbell Goblet Squat": {
    muscleBreakdown: [
      { muscle: "Quads", percentage: 80 },
      { muscle: "Glutes", percentage: 10 },
      { muscle: "Abs", percentage: 10 },
    ],
    instructions: [
      "Stand holding a single heavy dumbbell vertically against your chest with both hands.",
      "Brace your core, keep your torso upright, and push your hips back to initiate the squat.",
      "Lower yourself until your elbows pass the inside of your knees.",
      "Drive through your mid-foot to stand back up, keeping the weight pinned to your chest.",
    ],
  },

  "Dumbbell Hip Thrust": {
    muscleBreakdown: [
      { muscle: "Glutes", percentage: 80 },
      { muscle: "Hamstrings", percentage: 20 },
    ],
    instructions: [
      "Sit on the floor with your upper back against a bench and place a heavy dumbbell horizontally across your hips.",
      "Plant your feet flat on the floor, shoulder-width apart.",
      "Drive through your heels to raise your hips until your body forms a straight line from knees to shoulders.",
      "Squeeze your glutes hard at the top, then lower under control.",
    ],
  },

  "Dumbbell Incline Bench Press": {
    muscleBreakdown: [
      { muscle: "Chest", percentage: 70 },
      { muscle: "Shoulders", percentage: 20 },
      { muscle: "Triceps", percentage: 10 },
    ],
    instructions: [
      "Set a bench to a 30 to 45-degree angle. Kick the dumbbells up to your shoulders and lie back.",
      "Press the weights directly over your upper chest.",
      "Lower the dumbbells wide and deep until you feel a maximum stretch in your chest.",
      "Press the weights back up and slightly inward, squeezing the pecs at the top.",
    ],
  },

  "Dumbbell Incline Curl": {
    muscleBreakdown: [{ muscle: "Biceps", percentage: 100 }],
    instructions: [
      "Set an incline bench to about 45 degrees and lie back with a dumbbell in each hand.",
      "Let your arms hang straight down toward the floor, keeping your shoulders pinned back.",
      "Curl the weights up without letting your elbows drift forward.",
      "Lower the dumbbells under strict control to fully stretch the biceps at the bottom.",
    ],
  },

  "Dumbbell Incline Fly": {
    muscleBreakdown: [
      { muscle: "Chest", percentage: 90 },
      { muscle: "Shoulders", percentage: 10 },
    ],
    instructions: [
      "Lie on an incline bench (30-45 degrees) holding dumbbells above your chest, palms facing each other.",
      "With a slight bend in your elbows, lower the weights out to your sides in a wide arc.",
      "Stop when you feel a deep stretch in your upper chest.",
      "Squeeze your chest to bring the dumbbells back together at the top.",
    ],
  },

  "Dumbbell Kickback": {
    muscleBreakdown: [{ muscle: "Triceps", percentage: 100 }],
    instructions: [
      "Place one knee and hand on a flat bench. Hold a dumbbell in your free hand.",
      "Row your elbow up so your upper arm is parallel to the floor and pin it to your side.",
      "Extend your forearm straight back until your arm is fully locked out.",
      "Squeeze the tricep hard, then slowly return to the 90-degree starting angle.",
    ],
  },

  "Dumbbell Lunges": {
    muscleBreakdown: [
      { muscle: "Quads", percentage: 50 },
      { muscle: "Glutes", percentage: 40 },
      { muscle: "Hamstrings", percentage: 10 },
    ],
    instructions: [
      "Stand holding a dumbbell in each hand by your sides.",
      "Take a large step forward with one leg and sink your hips straight down.",
      "Lower until your trailing knee lightly taps the floor and your front thigh is parallel to the ground.",
      "Push off your front foot to return to the starting position.",
    ],
  },

  "Dumbbell Lying Leg Curl": {
    muscleBreakdown: [{ muscle: "Hamstrings", percentage: 100 }],
    instructions: [
      "Lie face down on a flat bench or mat with a dumbbell pinched securely between your feet.",
      "Keep your hips pressed firmly against the bench.",
      "Curl your lower legs up toward your glutes, squeezing the hamstrings hard.",
      "Lower the dumbbell slowly to a full stretch without letting it touch the ground.",
    ],
  },

  "Dumbbell Overhead Tricep Extension": {
    muscleBreakdown: [{ muscle: "Triceps", percentage: 100 }],
    instructions: [
      "Sit or stand holding a single dumbbell vertically with both hands underneath the top plate.",
      "Press the dumbbell straight overhead.",
      "Keep your elbows pointing up and lower the weight behind your head until you feel a deep stretch.",
      "Extend your arms to press the weight back to the top position.",
    ],
  },

  "Dumbbell Pullover": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 60 },
      { muscle: "Chest", percentage: 40 },
    ],
    instructions: [
      "Lie perpendicular across a flat bench with only your upper back supported, holding a single dumbbell with both hands above your chest.",
      "Keep a slight bend in your elbows and lower the weight in an arc behind your head.",
      "Drop the weight until you feel a deep stretch in your lats and chest.",
      "Pull the dumbbell back over your chest to the starting position.",
    ],
  },

  "Dumbbell Rear Lateral Raise": {
    muscleBreakdown: [
      { muscle: "Rear Delts", percentage: 80 },
      { muscle: "Traps", percentage: 20 },
    ],
    instructions: [
      "Hold a pair of dumbbells and hinge forward at the hips until your torso is nearly parallel to the floor.",
      "Let the weights hang straight down with a slight bend in your elbows.",
      "Raise the dumbbells out to your sides, focusing on pulling with the back of your shoulders.",
      "Squeeze your rear delts at the top and lower the weights under control.",
    ],
  },

  "Dumbbell Romanian Deadlift": {
    muscleBreakdown: [
      { muscle: "Hamstrings", percentage: 60 },
      { muscle: "Glutes", percentage: 30 },
      { muscle: "Lower Back", percentage: 10 },
    ],
    instructions: [
      "Stand holding dumbbells in front of your thighs with a neutral or overhand grip.",
      "Keep your legs mostly straight with a slight, soft bend in the knees.",
      "Push your hips straight back, lowering the weights along your legs until you feel a deep stretch in your hamstrings.",
      "Squeeze your glutes to drive your hips forward and return to a standing position.",
    ],
  },

  "Dumbbell Seal Row": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 70 },
      { muscle: "Rear Delts", percentage: 15 },
      { muscle: "Biceps", percentage: 15 },
    ],
    instructions: [
      "Lie face down on an elevated bench with a dumbbell in each hand resting on the floor.",
      "Let your arms hang at full extension to stretch the upper back.",
      "Row the dumbbells up toward your ribs, squeezing your shoulder blades together.",
      "Lower the weights slowly back to the floor without losing tension.",
    ],
  },

  "Dumbbell Shrug": {
    muscleBreakdown: [{ muscle: "Traps", percentage: 100 }],
    instructions: [
      "Stand tall holding a heavy dumbbell in each hand by your sides.",
      "Keep your arms completely straight and shrug your shoulders straight up toward your ears.",
      "Hold the top contraction and squeeze your traps forcefully for one second.",
      "Lower the dumbbells under control back to a dead hang.",
    ],
  },

  "Dumbbell Single Arm Row": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 70 },
      { muscle: "Biceps", percentage: 20 },
      { muscle: "Rear Delts", percentage: 10 },
    ],
    instructions: [
      "Place one knee and the same-side hand on a flat bench for support. Your torso should be parallel to the floor.",
      "Hold a dumbbell in your free hand, letting it hang straight down to stretch the lat.",
      "Pull the dumbbell up and back toward your hip, squeezing your back hard.",
      "Lower the weight back to a dead stretch under complete control.",
    ],
  },

  "Dumbbell Single Leg Deadlift": {
    muscleBreakdown: [
      { muscle: "Hamstrings", percentage: 60 },
      { muscle: "Glutes", percentage: 40 },
    ],
    instructions: [
      "Stand holding a dumbbell in the hand opposite to your working leg.",
      "Hinge at the hips, keeping your working leg slightly bent, and extend your free leg straight back for balance.",
      "Lower the dumbbell toward the floor until you feel a deep stretch in the planted leg's hamstring.",
      "Squeeze your glutes to pull your torso back upright.",
    ],
  },

  "Dumbbell Squeeze Press": {
    muscleBreakdown: [
      { muscle: "Chest", percentage: 80 },
      { muscle: "Triceps", percentage: 20 },
    ],
    instructions: [
      "Lie on a flat bench holding two dumbbells together directly over your chest, palms facing each other.",
      "Actively crush the dumbbells against each other as hard as you can.",
      "Lower the weights to your chest while maintaining this inward crushing pressure.",
      "Press back up to the top, still squeezing the dumbbells together to maximize chest activation.",
    ],
  },

  "Dumbbell Step Ups": {
    muscleBreakdown: [
      { muscle: "Quads", percentage: 60 },
      { muscle: "Glutes", percentage: 40 },
    ],
    instructions: [
      "Stand holding a dumbbell in each hand facing a sturdy box or bench.",
      "Plant your leading foot entirely on the box.",
      "Drive through the heel of your elevated foot to lift your body up until that leg is straight.",
      "Control the descent slowly, tapping your trailing foot on the ground before the next rep.",
    ],
  },

  "Dumbbell Stiff Leg Deadlift": {
    muscleBreakdown: [
      { muscle: "Hamstrings", percentage: 80 },
      { muscle: "Glutes", percentage: 10 },
      { muscle: "Lower Back", percentage: 10 },
    ],
    instructions: [
      "Stand holding dumbbells in front of you. Keep your knees almost entirely locked.",
      "Hinge at the hips and lower the weights straight down your legs.",
      "Stop when you reach maximum hamstring flexibility; do not round your lower back to go deeper.",
      "Pull yourself back up using only your hamstrings and glutes.",
    ],
  },

  "Dumbbell Sumo Deadlift": {
    muscleBreakdown: [
      { muscle: "Glutes", percentage: 50 },
      { muscle: "Quads", percentage: 30 },
      { muscle: "Hamstrings", percentage: 20 },
    ],
    instructions: [
      "Take a wide stance with toes pointed out and hold a single heavy dumbbell vertically with both hands in the center.",
      "Drop your hips, keep your chest up, and maintain a flat back.",
      "Drive through your heels to stand up, squeezing your glutes hard at the top.",
      "Lower the dumbbell under control, tapping it on the floor between reps.",
    ],
  },

  "Dumbbell Twist Curl": {
    muscleBreakdown: [
      { muscle: "Biceps", percentage: 90 },
      { muscle: "Forearms", percentage: 10 },
    ],
    instructions: [
      "Stand holding dumbbells at your sides with a neutral grip (palms facing your legs).",
      "As you curl the weights up, smoothly rotate your wrists so your palms face your shoulders at the top (supination).",
      "Squeeze the biceps at peak contraction.",
      "Lower the weights while rotating your wrists back to the neutral starting position.",
    ],
  },

  // ── Cable ────────────────────────────────────────────────────────────────────

  "Cable Curl": {
    muscleBreakdown: [{ muscle: "Biceps", percentage: 100 }],
    instructions: [
      "Attach a straight bar or rope to the lowest pulley setting and stand facing the machine.",
      "Keep your elbows pinned to your sides and your torso completely stationary.",
      "Curl the weight up, squeezing your biceps hard against the constant cable tension.",
      "Lower the attachment under strict control back to full arm extension.",
    ],
  },

  "Cable Fly": {
    muscleBreakdown: [
      { muscle: "Chest", percentage: 90 },
      { muscle: "Shoulders", percentage: 10 },
    ],
    instructions: [
      "Set the pulleys to chest height, grab the handles, and take a staggered stance in the center.",
      "Keep a slight bend in your elbows and lock your arms in this position.",
      "Bring your hands together in a wide arc, squeezing your chest hard in the center.",
      "Slowly return to the starting position, allowing the cables to pull your chest into a deep stretch.",
    ],
  },

  "Cable Lateral Raise": {
    muscleBreakdown: [{ muscle: "Shoulders", percentage: 100 }],
    instructions: [
      "Set a pulley to the lowest setting and stand sideways to the machine, holding the handle with your outside hand.",
      "Keep a slight bend in your elbow and raise your arm out to the side until it reaches shoulder height.",
      "Pause for a split second at the top of the movement.",
      "Resist the pull of the cable as you lower your arm back to the starting position.",
    ],
  },

  "Cable Overhead Tricep Extension": {
    muscleBreakdown: [{ muscle: "Triceps", percentage: 100 }],
    instructions: [
      "Attach a rope to a low or mid-level pulley and face away from the machine.",
      "Grip the rope behind your head with your elbows pointing up toward the ceiling.",
      "Extend your arms fully, pressing the rope forward and apart at the top.",
      "Control the weight back down until you feel a deep stretch in your triceps.",
    ],
  },

  "Cable Pull Through": {
    muscleBreakdown: [
      { muscle: "Glutes", percentage: 70 },
      { muscle: "Hamstrings", percentage: 30 },
    ],
    instructions: [
      "Attach a rope to the lowest pulley setting. Face away from the machine and straddle the cable, holding the rope between your legs.",
      "Take a few steps forward to create tension, keeping a soft bend in your knees.",
      "Hinge at the hips, letting the cable pull your hands through your legs until your hamstrings stretch.",
      "Drive your hips forward and squeeze your glutes hard to return to a standing position.",
    ],
  },

  "Cable Upright Row": {
    muscleBreakdown: [
      { muscle: "Shoulders", percentage: 60 },
      { muscle: "Traps", percentage: 40 },
    ],
    instructions: [
      "Attach a straight bar or rope to the lowest pulley and stand facing the machine.",
      "Grip the attachment with both hands and stand tall.",
      "Pull the weight straight up toward your chin, leading with your elbows.",
      "Pause at the top when your elbows are at shoulder height, then lower slowly.",
    ],
  },

  "Low to High Cable Fly": {
    muscleBreakdown: [
      { muscle: "Chest", percentage: 80 },
      { muscle: "Shoulders", percentage: 20 },
    ],
    instructions: [
      "Set the pulleys to the lowest position and grab the handles, taking a staggered stance.",
      "With a slight bend in your elbows, pull the handles upward and inward.",
      "Bring your hands together at upper-chest or face height to target the upper pecs.",
      "Lower the weight under control back to the starting stretched position.",
    ],
  },

  // ── Machine ──────────────────────────────────────────────────────────────────

  "Chest Supported Row Machine": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 70 },
      { muscle: "Biceps", percentage: 20 },
      { muscle: "Rear Delts", percentage: 10 },
    ],
    instructions: [
      "Adjust the seat so the chest pad supports your torso and you can easily reach the handles.",
      "Grip the handles and pull the weight back, driving your elbows behind your torso.",
      "Squeeze your shoulder blades together intensely at peak contraction.",
      "Slowly extend your arms fully to let your shoulder blades protract and stretch.",
    ],
  },

  "Incline Machine Press": {
    muscleBreakdown: [
      { muscle: "Chest", percentage: 70 },
      { muscle: "Shoulders", percentage: 20 },
      { muscle: "Triceps", percentage: 10 },
    ],
    instructions: [
      "Adjust the seat so the handles align with your upper chest.",
      "Keep your back flat against the pad and press the handles outward until your arms are fully extended.",
      "Do not lock out your elbows completely to keep tension on the chest.",
      "Lower the weight slowly until you feel a deep stretch in your upper pecs.",
    ],
  },

  "Machine Chest Press": {
    muscleBreakdown: [
      { muscle: "Chest", percentage: 70 },
      { muscle: "Triceps", percentage: 20 },
      { muscle: "Shoulders", percentage: 10 },
    ],
    instructions: [
      "Adjust the seat height so the handles align with the middle of your chest.",
      "Grip the handles and press forward smoothly until your arms are straight.",
      "Squeeze your pecs hard at the top of the movement.",
      "Control the handles back to the starting position to stretch the chest.",
    ],
  },

  "Machine Lateral Raise": {
    muscleBreakdown: [{ muscle: "Shoulders", percentage: 100 }],
    instructions: [
      "Adjust the seat so your shoulders align with the machine's pivot points.",
      "Place your forearms or elbows against the pads and grip the handles.",
      "Raise your arms out to the sides until they are parallel to the floor.",
      "Lower the weight slowly, keeping tension on the lateral deltoids.",
    ],
  },

  "Machine Row": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 70 },
      { muscle: "Biceps", percentage: 20 },
      { muscle: "Rear Delts", percentage: 10 },
    ],
    instructions: [
      "Sit at the machine with your chest against the pad and grip the handles.",
      "Pull the handles toward your torso, pulling your elbows straight back.",
      "Retract your scapula and squeeze your back at the end of the movement.",
      "Slowly release the weight until your arms are straight and your lats stretch.",
    ],
  },

  "Machine Shoulder Press": {
    muscleBreakdown: [
      { muscle: "Shoulders", percentage: 70 },
      { muscle: "Triceps", percentage: 30 },
    ],
    instructions: [
      "Adjust the seat so the handles are roughly at shoulder height.",
      "Press the weight straight overhead until your arms are extended.",
      "Keep your core braced and your lower back pressed against the backrest.",
      "Lower the handles under control back to the starting position.",
    ],
  },

  "Preacher Curl Machine": {
    muscleBreakdown: [{ muscle: "Biceps", percentage: 100 }],
    instructions: [
      "Adjust the seat so your armpits rest comfortably over the top of the pad.",
      "Grip the handles and curl the weight up toward your face.",
      "Squeeze your biceps hard at the peak of the contraction.",
      "Lower the weight slowly until your arms are almost fully extended, feeling a deep stretch.",
    ],
  },

  "Reverse Pec Deck": {
    muscleBreakdown: [
      { muscle: "Rear Delts", percentage: 80 },
      { muscle: "Traps", percentage: 20 },
    ],
    instructions: [
      "Sit facing the machine with your chest against the pad. Adjust the handles to the rearmost setting.",
      "Grip the handles with your arms parallel to the floor.",
      "Pull the handles out and back in a wide arc, squeezing your rear delts and upper back.",
      "Control the weight back to the starting position without letting the plates touch.",
    ],
  },

  "Tricep Dip Machine": {
    muscleBreakdown: [
      { muscle: "Triceps", percentage: 70 },
      { muscle: "Chest", percentage: 20 },
      { muscle: "Shoulders", percentage: 10 },
    ],
    instructions: [
      "Sit securely in the machine and grip the handles at your sides.",
      "Keep your torso upright to focus on the triceps rather than the chest.",
      "Press the handles down until your arms are fully locked out.",
      "Slowly let the handles rise back up until your elbows are past 90 degrees.",
    ],
  },

  "Hip Abduction Machine": {
    muscleBreakdown: [{ muscle: "Glutes", percentage: 100 }],
    instructions: [
      "Sit in the machine with your knees against the outer pads.",
      "Brace your core and press your legs outward against the resistance.",
      "Pause for a second when your legs are fully spread to squeeze the glute medius.",
      "Return the pads slowly to the starting position under tension.",
    ],
  },

  // ── Mixed / Other ────────────────────────────────────────────────────────────

  "45 Degree Back Raise": {
    muscleBreakdown: [
      { muscle: "Lower Back", percentage: 50 },
      { muscle: "Glutes", percentage: 30 },
      { muscle: "Hamstrings", percentage: 20 },
    ],
    instructions: [
      "Position yourself in the apparatus so your hips are completely clear of the top pad.",
      "Cross your arms over your chest and lower your torso until you feel a deep stretch in your hamstrings.",
      "Use your hamstrings and glutes to pull your torso back up until your body is in a straight line.",
      "Avoid hyperextending your lower back at the top of the movement.",
    ],
  },

  "Calves on Leg Press": {
    muscleBreakdown: [{ muscle: "Calves", percentage: 100 }],
    instructions: [
      "Sit in a leg press machine and place only the balls of your feet on the bottom edge of the sled.",
      "Keep your legs straight with a very slight, soft bend in the knees.",
      "Let the weight push your toes back until your calves are fully stretched.",
      "Press the sled up using only your toes, flexing your calves as hard as possible at the top.",
    ],
  },

  "Dips": {
    muscleBreakdown: [
      { muscle: "Triceps", percentage: 60 },
      { muscle: "Chest", percentage: 30 },
      { muscle: "Shoulders", percentage: 10 },
    ],
    instructions: [
      "Suspend yourself on parallel dip bars with your arms fully extended.",
      "Keep your torso mostly upright to bias the triceps, or lean forward slightly to hit the chest.",
      "Lower your body until your shoulders are slightly below your elbows.",
      "Press forcefully back up to the starting position.",
    ],
  },

  "EZ Bar Curl": {
    muscleBreakdown: [
      { muscle: "Biceps", percentage: 90 },
      { muscle: "Forearms", percentage: 10 },
    ],
    instructions: [
      "Stand holding an EZ-curl bar with a slightly angled underhand grip.",
      "Keep your elbows pinned to your sides and curl the bar toward your shoulders.",
      "Squeeze your biceps at the peak of the contraction.",
      "Lower the bar slowly to full extension.",
    ],
  },

  "Glute Ham Raise": {
    muscleBreakdown: [
      { muscle: "Hamstrings", percentage: 80 },
      { muscle: "Glutes", percentage: 10 },
      { muscle: "Calves", percentage: 10 },
    ],
    instructions: [
      "Position yourself on the GHR machine with your ankles locked and your knees resting near the bottom of the pad.",
      "Lower your torso forward until your body is parallel to the ground.",
      "Curl your body back up by driving your toes into the footplate and flexing your hamstrings.",
      "Finish the movement completely upright, squeezing your glutes and hamstrings.",
    ],
  },

  "Single Leg Dumbbell Calf Raise": {
    muscleBreakdown: [{ muscle: "Calves", percentage: 100 }],
    instructions: [
      "Stand on the edge of a step holding a dumbbell in the same hand as your working leg.",
      "Let your heel drop as far as possible to deeply stretch the calf.",
      "Drive up onto the ball of your foot, pausing for a second at maximum contraction.",
      "Lower slowly back into the stretch.",
    ],
  },

  "Straight Arm Pulldown": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 80 },
      { muscle: "Triceps", percentage: 20 },
    ],
    instructions: [
      "Attach a straight bar or rope to a high pulley. Step back and hinge forward slightly at the hips.",
      "Keep your arms mostly straight with just a slight bend in the elbows.",
      "Pull the attachment down in an arc until it reaches your thighs.",
      "Slowly resist the weight back up to eye level, feeling a stretch through your lats.",
    ],
  },

  "T-Bar Row": {
    muscleBreakdown: [
      { muscle: "Back", percentage: 70 },
      { muscle: "Biceps", percentage: 20 },
      { muscle: "Lower Back", percentage: 10 },
    ],
    instructions: [
      "Straddle a T-bar row machine and grip the handles firmly.",
      "Hinge at the hips, keeping your back completely flat and your chest up.",
      "Pull the weight into your abdomen, retracting your shoulder blades forcefully.",
      "Lower the weight back to full arm extension under control.",
    ],
  },

  "Barbell Romanian Deadlift": {
    muscleBreakdown: [
      { muscle: "Hamstrings", percentage: 60 },
      { muscle: "Glutes", percentage: 30 },
      { muscle: "Lower Back", percentage: 10 },
    ],
    instructions: [
      "Stand with feet shoulder-width apart, holding the barbell with an overhand grip.",
      "Keep your legs mostly straight with a slight, soft bend in the knees.",
      "Push your hips straight back, lowering the bar along your legs until you feel a deep stretch in your hamstrings.",
      "Squeeze your glutes to drive your hips forward and return to a standing position.",
    ],
  },

  "Hack Squat": {
    muscleBreakdown: [
      { muscle: "Quads", percentage: 80 },
      { muscle: "Glutes", percentage: 20 },
    ],
    instructions: [
      "Position your shoulders under the pads and place your feet in the middle of the platform.",
      "Lower yourself smoothly while keeping your back flat against the backrest.",
      "Descend until your thighs are at least parallel to the footplate.",
      "Press forcefully through your mid-foot to return to the top.",
    ],
  },

  "Leg Extension": {
    muscleBreakdown: [{ muscle: "Quads", percentage: 100 }],
    instructions: [
      "Adjust the machine so the pad rests just above your ankles and your knees align with the machine's pivot point.",
      "Grip the handles firmly to lock your torso in place.",
      "Extend your legs fully to the top, squeezing your quads hard for a split second.",
      "Lower the weight under complete control back to the starting position.",
    ],
  },

  "Leg Press": {
    muscleBreakdown: [
      { muscle: "Quads", percentage: 70 },
      { muscle: "Glutes", percentage: 20 },
      { muscle: "Hamstrings", percentage: 10 },
    ],
    instructions: [
      "Sit in the machine and place your feet shoulder-width apart on the sled.",
      "Unrack the weight and slowly lower the sled until your knees are bent at 90 degrees or deeper.",
      "Keep your lower back pressed firmly against the pad.",
      "Drive through your full foot to extend your legs, stopping just short of locking your knees.",
    ],
  },

  "Pec Deck Machine": {
    muscleBreakdown: [
      { muscle: "Chest", percentage: 90 },
      { muscle: "Shoulders", percentage: 10 },
    ],
    instructions: [
      "Adjust the seat height so the handles or pads are directly in line with your mid-chest.",
      "Sit with your back flat against the pad and grip the handles with a slight bend in your elbows.",
      "Squeeze your chest hard to bring the handles together directly in front of you.",
      "Slowly reverse the motion under control until you feel a deep stretch across your pecs.",
    ],
  },

  "Seated Leg Curl": {
    muscleBreakdown: [
      { muscle: "Hamstrings", percentage: 90 },
      { muscle: "Calves", percentage: 10 },
    ],
    instructions: [
      "Adjust the backrest so your knees align with the machine's pivot point, and lower the lap pad to secure your thighs.",
      "Place your lower legs on top of the ankle pad and grip the handles to brace your upper body.",
      "Curl your lower legs downward and back as far as possible, squeezing the hamstrings intensely.",
      "Control the weight back up to the starting position, allowing for a full stretch at the top.",
    ],
  },
};
