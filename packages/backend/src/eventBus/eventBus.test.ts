import { expect, it, vi } from "vitest";
import { BUS_OBS_ERROR_RESOLVED } from "./types.js";
import { eventBus } from "./eventBus.js";

it("correctly subscribes, unsubscribes, and emits data", () => {
  const handlerOne = vi.fn();
  const handlerTwo = vi.fn();

  eventBus.subscribe(BUS_OBS_ERROR_RESOLVED, handlerOne);
  eventBus.subscribe(BUS_OBS_ERROR_RESOLVED, handlerTwo);
  eventBus.emit(BUS_OBS_ERROR_RESOLVED, { errorCode: "BothReceived" });

  eventBus.unsubscribe(BUS_OBS_ERROR_RESOLVED, handlerOne);
  eventBus.emit(BUS_OBS_ERROR_RESOLVED, { errorCode: "SecondReceived" });

  eventBus.unsubscribe(BUS_OBS_ERROR_RESOLVED, handlerTwo);
  eventBus.emit(BUS_OBS_ERROR_RESOLVED, { errorCode: "NobodyReceived" });

  expect(handlerOne).toHaveBeenCalledTimes(1);
  expect(handlerOne).toHaveBeenCalledWith({ errorCode: "BothReceived" });

  expect(handlerTwo).toHaveBeenCalledTimes(2);
  expect(handlerTwo).toHaveBeenCalledWith({ errorCode: "BothReceived" });
  expect(handlerTwo).toHaveBeenCalledWith({ errorCode: "SecondReceived" });
});
