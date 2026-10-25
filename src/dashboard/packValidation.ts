/**
 * Client-side mirror of `_validate_pack_data` in routes/api/dashboard.py and
 * the `__validate_fields__` rules on the pack models.
 *
 * The backend still validates. This exists because the backend can only point
 * at rows it already knows: for a row created in this session there is no id
 * to report, and `_validate_pack_data` reads `question_data["id"]` on its error
 * path, which turns the error into a 500. Catching the problem here lets the
 * editor highlight the exact field on rows that have no database id yet.
 */

import type { PackSaveError, Question, QuestionPack } from "@shared/types";

/** Config.VALID_TITLE_CHARACTERS */
const VALID_TITLE = /^[a-zA-Z0-9æøåÆØÅé_/\-'!?+(),.:&% ]*$/;
/** Config.MAX_ANSWER_CHOICES */
export const MAX_ANSWER_CHOICES = 8;
const MAX_CHOICE_LENGTH = 32;

type FieldError = Pick<PackSaveError, "response" | "field" | "index">;

function checkTitle(label: string, value: string, min: number, max: number): string | null {
  if (value.length < min) {
    return min === 1 ? `${label} must not be empty` : `${label} must be at least ${min} characters`;
  }
  if (value.length > max) return `${label} must be at most ${max} characters`;
  if (!VALID_TITLE.test(value)) return `${label} contains invalid characters`;
  return null;
}

/** Used by the question editor before committing, and by the store before saving. */
export function validateQuestion(question: Question): FieldError | null {
  const extra = question.extra;

  const value = Number(question.value);
  if (!Number.isInteger(value) || value <= 0 || value >= 10000) {
    return { response: "Invalid value for question. Must be a number between 1-9999", field: "value" };
  }

  const questionError = checkTitle("Question", question.question, 3, 128);
  if (questionError) return { response: questionError, field: "question" };

  const answerError = checkTitle("Answer", question.answer, 1, 128);
  if (answerError) return { response: answerError, field: "answer" };

  if (extra.choices) {
    if (extra.choices.length > MAX_ANSWER_CHOICES) {
      return {
        response: `Amount of answer choices must not be greater than ${MAX_ANSWER_CHOICES}`,
        field: "choices",
      };
    }
    for (const [index, choice] of extra.choices.entries()) {
      if (choice === "") {
        return { response: "Answer choice must not be empty", field: "choices", index: index + 1 };
      }
      if (choice.length > MAX_CHOICE_LENGTH) {
        return {
          response: `Answer choice must be less than ${MAX_CHOICE_LENGTH} characters`,
          field: "choices",
          index: index + 1,
        };
      }
    }
    if (!extra.choices.includes(question.answer)) {
      return { response: "One of the choices must be equal to the correct answer", field: "choices" };
    }
  }

  if ((extra.question_image || extra.video) && !extra.height) {
    return { response: "The height of an image or video must be specified", field: "media" };
  }

  return null;
}

/**
 * Validates everything that will be sent. `rounds` is the list as it will be
 * saved, which is not always `pack.rounds` -- see `buildPayload` in the store.
 */
export function validatePack(pack: QuestionPack, finaleRoundId: string | null): PackSaveError | null {
  const nameError = checkTitle("Pack name", pack.name, 3, 64);
  if (nameError) return { response: nameError, field: "name" };

  for (const round of pack.rounds) {
    if (round.id === finaleRoundId && !pack.include_finale) continue;

    const roundError = checkTitle("Round name", round.name, 1, 64);
    if (roundError) return { response: roundError, round_id: round.id, field: "name" };

    if (round.id === finaleRoundId) {
      if (round.categories.length > 1) {
        return {
          response: `The finale round must have exactly one category, but has ${round.categories.length}`,
          round_id: round.id,
        };
      }
      const questions = round.categories.reduce((sum, c) => sum + c.questions.length, 0);
      if (questions > 1) {
        return {
          response: `The finale round must have exactly one question, but has ${questions}`,
          round_id: round.id,
        };
      }
    }

    for (const category of round.categories) {
      const categoryError = checkTitle("Category name", category.name, 1, 64);
      if (categoryError) {
        return { response: categoryError, round_id: round.id, category_id: category.id, field: "name" };
      }

      for (const question of category.questions) {
        const error = validateQuestion(question);
        if (error) {
          return { ...error, round_id: round.id, category_id: category.id, question_id: question.id };
        }
      }
    }
  }

  return null;
}
