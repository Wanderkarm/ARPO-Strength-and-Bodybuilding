export const restFacts = [
  {
    id: "rest-1",
    excerpt: "ARPO Directive: A 3-minute rest between heavy sets allows local force output to recover, sustaining your volume of hard sets.",
    citation: "Singer et al., 2024",
    paperTitle: "Give it a Rest: A systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy.",
    sampleSize: "Meta-analysis (Synthesis of multiple Randomized Controlled Trials)",
    methodology: "Researchers compared resistance training protocols using short (<60s) versus long (>60s, typically 2-3+ mins) rest intervals, matching for total sets performed.",
    keyFindings: "While shorter rests create a metabolic 'pump', longer rest intervals help maintain performance across multiple sets. Phosphocreatine recovers substantially, allowing you to sustain the high mechanical tension required for hypertrophy without premature local muscular fatigue terminating your set."
  },
  {
    id: "rom-1",
    excerpt: "ARPO Directive: Training at long muscle lengths (the stretched position) provides a distinct hypertrophic advantage, often rivaling or exceeding standard range of motion.",
    citation: "Wolf et al., 2023",
    paperTitle: "Partial Vs Full Range of Motion Resistance Training: A Systematic Review and Meta-Analysis.",
    sampleSize: "Meta-analysis of 24 structured studies",
    methodology: "Compared hypertrophy outcomes between subjects using Full Range of Motion (ROM), partial ROM at short muscle lengths (contracted position), and partial ROM at long muscle lengths (stretched position).",
    keyFindings: "Evidence strongly favors a lengthened bias. Performing movements where the muscle is under load in its fully stretched position (e.g., the bottom of a squat or fly) consistently outperforms shortened partials and serves as a highly effective, sometimes superior, alternative to traditional full ROM."
  },
  {
    id: "rir-1",
    excerpt: "ARPO Directive: Absolute failure is not required. Terminating sets 1-2 reps shy of failure yields equivalent muscle growth with a manageable recovery cost.",
    citation: "Refalo et al., 2023",
    paperTitle: "Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy.",
    sampleSize: "Systematic Review with Meta-analysis",
    methodology: "Evaluated studies comparing groups lifting to absolute momentary muscular failure versus groups stopping a predetermined number of Reps in Reserve (RIR).",
    keyFindings: "Training to absolute momentary failure provides no additional hypertrophic benefit over stopping 1-2 Reps in Reserve (RIR). Pushing to zero RIR increases systemic and local fatigue, unnecessarily driving up the recovery cost of your training block without added muscle growth."
  },
  {
    id: "vol-1",
    excerpt: "ARPO Directive: The number of 'hard sets' taken close to failure is the primary metric for volume, not just total weight moved.",
    citation: "Schoenfeld et al., 2017",
    paperTitle: "Dose-response relationship between weekly resistance training volume and increases in muscle mass.",
    sampleSize: "Meta-analysis of 15 clinical studies",
    methodology: "Compared the hypertrophic outcomes of low volume (<5 sets per muscle/week), moderate volume (5-9 sets), and high volume (10+ sets).",
    keyFindings: "A clear dose-response relationship exists: up to roughly 10-20 hard sets per muscle group per week, more volume equals more growth. However, volume is only effective if intensity is high. Tonnage matters for tracking progressive overload, but only if those sets are legitimate, high-effort exposures to mechanical tension."
  },
  {
    id: "pro-1",
    excerpt: "ARPO Directive: Muscle protein synthesis optimally plateaus between 0.75g and 1g of protein per pound of body weight daily.",
    citation: "Morton et al., 2018",
    paperTitle: "A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains.",
    sampleSize: "49 studies comprising 1,863 participants",
    methodology: "Analyzed the impact of dietary protein intake on muscle mass and strength gains during prolonged resistance training protocols.",
    keyFindings: "The training stimulus is the primary driver of growth; protein supports the adaptation. Data shows hypertrophy benefits plateau around 1.6 to 2.2 g/kg/day (roughly 0.75g to 1g/lb). Consuming vastly more provides diminishing returns, while chronic under-eating limits optimal tissue repair."
  }
];

export const glossaryTerms: Record<string, { title: string; definition: string }> = {
  "RIR": {
    title: "Reps in Reserve (RIR)",
    definition: "A measure of intensity indicating how many more reps you could have completed before physical failure. 0 RIR means absolute failure. 2 RIR means you stopped exactly 2 reps short of failing. Optimal hypertrophy occurs between 1-3 RIR."
  },
  "ROM": {
    title: "Range of Motion (ROM)",
    definition: "The full movement potential of a joint. While full ROM is the standard baseline, evidence strongly supports a 'lengthened bias'\u2014spending more time in the phase of the lift where the target muscle is fully stretched under load."
  },
  "Tonnage": {
    title: "Tonnage (Volume Load)",
    definition: "Calculated as: Sets \u00d7 Reps \u00d7 Weight. While 'Hard Sets' are the true driver of hypertrophy, tracking Tonnage is a vital mathematical proxy to ensure you are achieving Auto-Regulated Progressive Overload over time."
  },
  "Hard Sets": {
    title: "Hard Sets",
    definition: "A working set taken close to muscular failure (typically 1-3 RIR). Counting the number of Hard Sets per muscle group per week is the most clinically accurate way to track your true hypertrophic volume."
  },
  "Hypertrophy": {
    title: "Muscular Hypertrophy",
    definition: "The biological process of increasing the cross-sectional area of muscle fibers. It is primarily triggered by high mechanical tension, supported by adequate protein intake, and realized during sufficient recovery."
  },
  "Failure": {
    title: "Muscular Failure",
    definition: "The point during a set where you physically cannot complete another concentric (lifting) repetition with proper form. A powerful stimulus, but highly taxing on systemic recovery."
  },
  "ARPO": {
    title: "Auto-Regulated Progressive Overload",
    definition: "A dynamic programming method where your daily performance automatically dictates the precise load required in your next session to force continuous adaptation."
  },
  "MEV": {
    title: "Minimum Effective Volume (MEV)",
    definition: "The smallest number of hard sets per muscle group per week needed to make progress. Training below MEV is maintenance or regression territory. MEV varies by muscle, experience level, and recovery capacity — typically 6–10 sets/week for most muscles."
  },
  "MAV": {
    title: "Maximum Adaptive Volume (MAV)",
    definition: "The range of weekly sets where you get the most muscle growth — the sweet spot between too little and too much. MAV is the training volume that produces optimal hypertrophy for your current recovery capacity, usually 12–20 hard sets per muscle per week."
  },
  "MRV": {
    title: "Maximum Recoverable Volume (MRV)",
    definition: "The upper limit of weekly training volume your body can recover from and still adapt positively. Exceeding MRV leads to systemic fatigue, performance decline, and potential overtraining. MRV varies by training age, sleep, stress, and nutrition."
  },
  "TDEE": {
    title: "Total Daily Energy Expenditure (TDEE)",
    definition: "The total number of calories your body burns in a day, including your Basal Metabolic Rate (BMR) plus all activity — exercise, walking, work, fidgeting. TDEE is your maintenance calorie level: eat at TDEE and your weight stays the same."
  },
  "BMR": {
    title: "Basal Metabolic Rate (BMR)",
    definition: "The number of calories your body burns at complete rest just to sustain basic life functions — breathing, circulation, cell repair. BMR is calculated using the Mifflin-St Jeor equation and accounts for roughly 60–70% of your total daily calorie burn."
  },
  "1RM": {
    title: "One Rep Max (1RM)",
    definition: "The maximum weight you can lift for exactly one complete repetition with proper form. Your 1RM is a benchmark for relative strength and is used to calculate training percentages. ARPO estimates your 1RM from your logged sets using the Epley, Brzycki, and Lander formulas."
  }
};
