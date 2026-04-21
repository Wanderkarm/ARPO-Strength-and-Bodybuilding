import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { prisma } from "./prisma";
import { calculateNextWeekTargets } from "../utils/progressionAlgorithm";
import { getCategoryWeight, type BaselineWeights } from "../utils/categoryWeightMap";

const RIR_SCHEDULE: Record<number, string> = {
  1: "3 RIR",
  2: "2 RIR",
  3: "1 RIR",
  4: "Deload",
};

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/exercises", async (_req, res) => {
    try {
      const exercises = await prisma.exercise.findMany({
        orderBy: { category: "asc" },
      });
      res.json(exercises);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch exercises" });
    }
  });

  app.get("/api/exercises/category/:category", async (req, res) => {
    try {
      const exercises = await prisma.exercise.findMany({
        where: { category: req.params.category.toUpperCase() },
      });
      res.json(exercises);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch exercises" });
    }
  });

  app.get("/api/templates", async (_req, res) => {
    try {
      const templates = await prisma.template.findMany({
        where: { isCustom: false },
        include: {
          days: {
            orderBy: { dayNumber: "asc" },
            include: {
              exercises: {
                orderBy: { order: "asc" },
                include: { exercise: true },
              },
            },
          },
        },
      });
      res.json(templates);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.get("/api/templates/custom/:userId", async (req, res) => {
    try {
      const templates = await prisma.template.findMany({
        where: { isCustom: true, userId: req.params.userId },
        include: {
          days: {
            orderBy: { dayNumber: "asc" },
            include: {
              exercises: {
                orderBy: { order: "asc" },
                include: { exercise: true },
              },
            },
          },
        },
      });
      res.json(templates);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch custom templates" });
    }
  });

  app.get("/api/templates/:id", async (req, res) => {
    try {
      const template = await prisma.template.findUnique({
        where: { id: req.params.id },
        include: {
          days: {
            orderBy: { dayNumber: "asc" },
            include: {
              exercises: {
                orderBy: { order: "asc" },
                include: { exercise: true },
              },
            },
          },
        },
      });
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  app.post("/api/templates/custom", async (req, res) => {
    try {
      const { userId, name, days } = req.body as {
        userId: string;
        name: string;
        days: { dayNumber: number; exerciseIds: string[] }[];
      };

      const template = await prisma.template.create({
        data: {
          name,
          mesoType: days.length,
          isCustom: true,
          userId,
          days: {
            create: days.map((day) => ({
              dayNumber: day.dayNumber,
              exercises: {
                create: day.exerciseIds.map((exerciseId, index) => ({
                  exerciseId,
                  order: index + 1,
                })),
              },
            })),
          },
        },
        include: {
          days: {
            orderBy: { dayNumber: "asc" },
            include: {
              exercises: {
                orderBy: { order: "asc" },
                include: { exercise: true },
              },
            },
          },
        },
      });

      res.json(template);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create custom template" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const { gender, bodyweight, experience, baselineWeights } = req.body as {
        gender: string;
        bodyweight: number;
        experience: string;
        baselineWeights: BaselineWeights;
      };

      const user = await prisma.user.create({
        data: { gender, bodyweight, experience },
      });

      const categories = [
        "QUADS",
        "GLUTES",
        "HAMSTRINGS",
        "HORIZONTAL PUSH",
        "INCLINE PUSH",
        "VERTICAL PUSH",
        "HORIZONTAL BACK",
        "VERTICAL BACK",
        "BICEPS",
        "TRICEPS",
      ];

      for (const cat of categories) {
        const weight = getCategoryWeight(cat, baselineWeights);
        await prisma.userWeightBaseline.create({
          data: {
            userId: user.id,
            category: cat,
            weight,
          },
        });
      }

      const userWithBaselines = await prisma.user.findUnique({
        where: { id: user.id },
        include: { baselines: true },
      });

      res.json(userWithBaselines);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: {
          plans: {
            include: {
              template: true,
            },
          },
          baselines: true,
        },
      });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.post("/api/workout-plans", async (req, res) => {
    try {
      const { userId, templateId, exerciseSwaps } = req.body as {
        userId: string;
        templateId: string;
        exerciseSwaps?: Record<string, string>;
      };

      const template = await prisma.template.findUnique({
        where: { id: templateId },
        include: {
          days: {
            orderBy: { dayNumber: "asc" },
            include: {
              exercises: {
                orderBy: { order: "asc" },
                include: { exercise: true },
              },
            },
          },
        },
      });

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      const baselines = await prisma.userWeightBaseline.findMany({
        where: { userId },
      });

      const baselineMap: Record<string, number> = {};
      for (const b of baselines) {
        baselineMap[b.category] = b.weight;
      }

      const plan = await prisma.workoutPlan.create({
        data: { userId, templateId, currentWeek: 1, currentDay: 1 },
      });

      const rir = RIR_SCHEDULE[1];
      const targetSets = 3;

      for (const day of template.days) {
        for (const te of day.exercises) {
          let exerciseId = te.exerciseId;
          let exerciseCategory = te.exercise.category;

          if (exerciseSwaps && exerciseSwaps[te.exerciseId]) {
            const swappedId = exerciseSwaps[te.exerciseId];
            const swappedExercise = await prisma.exercise.findUnique({
              where: { id: swappedId },
            });
            if (swappedExercise) {
              exerciseId = swappedExercise.id;
              exerciseCategory = swappedExercise.category;
            }
          }

          const targetWeight = baselineMap[exerciseCategory] || 50;

          const workoutLog = await prisma.workoutLog.create({
            data: {
              workoutPlanId: plan.id,
              exerciseId,
              weekNumber: 1,
              dayNumber: day.dayNumber,
              targetSets,
              targetWeight,
              targetRIR: rir,
            },
          });

          for (let s = 1; s <= targetSets; s++) {
            await prisma.setLog.create({
              data: {
                workoutLogId: workoutLog.id,
                setNumber: s,
                targetWeight,
                targetReps: 10,
              },
            });
          }
        }
      }

      const planWithData = await prisma.workoutPlan.findUnique({
        where: { id: plan.id },
        include: {
          template: {
            include: {
              days: {
                orderBy: { dayNumber: "asc" },
                include: {
                  exercises: {
                    orderBy: { order: "asc" },
                    include: { exercise: true },
                  },
                },
              },
            },
          },
          logs: {
            include: {
              exercise: true,
              sets: { orderBy: { setNumber: "asc" } },
            },
          },
        },
      });

      res.json(planWithData);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create workout plan" });
    }
  });

  app.get("/api/workout-plans/:id", async (req, res) => {
    try {
      const plan = await prisma.workoutPlan.findUnique({
        where: { id: req.params.id },
        include: {
          template: {
            include: {
              days: {
                orderBy: { dayNumber: "asc" },
                include: {
                  exercises: {
                    orderBy: { order: "asc" },
                    include: { exercise: true },
                  },
                },
              },
            },
          },
          logs: {
            include: {
              exercise: true,
              sets: { orderBy: { setNumber: "asc" } },
            },
            orderBy: [{ weekNumber: "asc" }, { dayNumber: "asc" }],
          },
        },
      });
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      res.json(plan);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch workout plan" });
    }
  });

  app.post("/api/workout-logs/:id/swap", async (req, res) => {
    try {
      const { newExerciseId } = req.body as { newExerciseId: string };

      const log = await prisma.workoutLog.findUnique({
        where: { id: req.params.id },
        include: { sets: true },
      });
      if (!log) {
        return res.status(404).json({ error: "Workout log not found" });
      }

      const newExercise = await prisma.exercise.findUnique({
        where: { id: newExerciseId },
      });
      if (!newExercise) {
        return res.status(404).json({ error: "Exercise not found" });
      }

      await prisma.workoutLog.update({
        where: { id: log.id },
        data: { exerciseId: newExerciseId },
      });

      for (const set of log.sets) {
        await prisma.setLog.update({
          where: { id: set.id },
          data: {
            repsCompleted: null,
            weightUsed: null,
            completedAt: null,
          },
        });
      }

      const updated = await prisma.workoutLog.findUnique({
        where: { id: log.id },
        include: {
          exercise: true,
          sets: { orderBy: { setNumber: "asc" } },
        },
      });

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to swap exercise" });
    }
  });

  app.patch("/api/set-logs/:id", async (req, res) => {
    try {
      const { repsCompleted, weightUsed } = req.body;
      const updateData: Record<string, unknown> = {};
      if (repsCompleted !== undefined) updateData.repsCompleted = repsCompleted;
      if (weightUsed !== undefined) updateData.weightUsed = weightUsed;

      const setLog = await prisma.setLog.update({
        where: { id: req.params.id },
        data: updateData,
      });
      res.json(setLog);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update set log" });
    }
  });

  app.patch("/api/workout-logs/:id/soreness", async (req, res) => {
    try {
      const { sorenessRating } = req.body;
      const log = await prisma.workoutLog.update({
        where: { id: req.params.id },
        data: { sorenessRating },
        include: { exercise: true, sets: { orderBy: { setNumber: "asc" } } },
      });
      res.json(log);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update soreness" });
    }
  });

  app.post("/api/workout-complete", async (req, res) => {
    try {
      const { workoutPlanId, dayNumber, exercises } = req.body as {
        workoutPlanId: string;
        dayNumber: number;
        exercises: {
          logId: string;
          exerciseId: string;
          category: string;
          targetSets: number;
          targetWeight: number;
          targetRIR: string;
          sorenessRating: number;
          sets: {
            setLogId: string;
            repsCompleted: number;
            weightUsed: number;
          }[];
        }[];
      };

      const plan = await prisma.workoutPlan.findUnique({
        where: { id: workoutPlanId },
        include: { template: { include: { days: true } } },
      });
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const nextWeekTargets = [];
      let totalVolume = 0;

      for (const ex of exercises) {
        for (const set of ex.sets) {
          await prisma.setLog.update({
            where: { id: set.setLogId },
            data: {
              repsCompleted: set.repsCompleted,
              weightUsed: set.weightUsed,
              completedAt: new Date(),
            },
          });
          totalVolume += set.weightUsed * set.repsCompleted;
        }

        await prisma.workoutLog.update({
          where: { id: ex.logId },
          data: {
            sorenessRating: ex.sorenessRating,
            completedAt: new Date(),
          },
        });

        const avgReps =
          ex.sets.length > 0
            ? Math.round(
                ex.sets.reduce((sum, s) => sum + s.repsCompleted, 0) /
                  ex.sets.length
              )
            : 0;

        const maxActualWeight = ex.sets.length > 0
          ? Math.max(...ex.sets.map((s: any) => s.weightUsed).filter((w: number) => w > 0))
          : 0;
        const actualWeightServer = maxActualWeight > 0 ? maxActualWeight : ex.targetWeight;

        const nextTargets = calculateNextWeekTargets({
          exerciseId: ex.exerciseId,
          category: ex.category,
          weekNumber: plan.currentWeek,
          targetSets: ex.targetSets,
          targetWeight: ex.targetWeight,
          actualWeight: actualWeightServer,
          targetRIR: ex.targetRIR,
          repsCompleted: avgReps,
          repGoal: 10,
          sorenessRating: ex.sorenessRating,
        });
        nextWeekTargets.push(nextTargets);
      }

      const totalDays = plan.template.days.length;

      const uniqueCompletedDays = await prisma.workoutLog.groupBy({
        by: ["dayNumber"],
        where: {
          workoutPlanId,
          weekNumber: plan.currentWeek,
          completedAt: { not: null },
        },
      });

      const allDaysComplete = uniqueCompletedDays.length >= totalDays;

      if (allDaysComplete) {
        const nextWeek = plan.currentWeek + 1;
        await prisma.workoutPlan.update({
          where: { id: workoutPlanId },
          data: { currentWeek: nextWeek, currentDay: 1 },
        });

        const rir = RIR_SCHEDULE[((nextWeek - 1) % 4) + 1] || "3 RIR";

        for (const target of nextWeekTargets) {
          const newLog = await prisma.workoutLog.create({
            data: {
              workoutPlanId,
              exerciseId: target.exerciseId,
              weekNumber: target.weekNumber,
              dayNumber,
              targetSets: target.targetSets,
              targetWeight: target.targetWeight,
              targetRIR: rir,
            },
          });

          for (let s = 1; s <= target.targetSets; s++) {
            await prisma.setLog.create({
              data: {
                workoutLogId: newLog.id,
                setNumber: s,
                targetWeight: target.targetWeight,
                targetReps: 10,
              },
            });
          }
        }
      } else {
        const nextDayNum = dayNumber < totalDays ? dayNumber + 1 : 1;
        await prisma.workoutPlan.update({
          where: { id: workoutPlanId },
          data: { currentDay: nextDayNum },
        });
      }

      res.json({
        nextWeekTargets,
        totalVolume,
        weekNumber: plan.currentWeek,
        dayNumber,
        allDaysComplete,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to complete workout" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
