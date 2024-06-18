import { ProcessEngine } from "./index.ts";
import {
  IBeltPluginError,
  IBeltPluginInput,
  IBeltPluginOutput,
} from "../belt-plugin/types.ts";
import { ConveeError } from "../error/index.ts";
import { MetadataHelper } from "../metadata/collector/index.ts";

const processFunctionNotImplementedError = "process function not implemented";

describe("process-engine", () => {
  describe("during initialization", () => {
    it("should initialize with no arguments", () => {
      const processEngine = new ProcessEngine();

      expect(processEngine).toBeDefined();
    });

    it("should initialize with a new id if none is provided", () => {
      const processEngine = new ProcessEngine();

      expect(processEngine.id).toBeDefined();
    });

    it("should initialize with the provided id", () => {
      const processEngine = new ProcessEngine({ id: "test" });

      expect(processEngine.id).toEqual("test");
    });

    it("should initialize with no plugins if none is provided", () => {
      const processEngine = new ProcessEngine();
      const spyProcessEnginePlugins = jest.mocked(
        (processEngine as any).plugins
      );

      expect(spyProcessEnginePlugins).toEqual([]);
    });

    it("should initialize with the provided input plugins", () => {
      const mockPlugin = { name: "mockPlugin" } as IBeltPluginInput<number>;
      const processEngine = new ProcessEngine<number, string, Error>({
        plugins: [mockPlugin],
      });
      const spyProcessEnginePlugins = jest.mocked(
        (processEngine as any).plugins
      );

      expect(spyProcessEnginePlugins).toEqual([mockPlugin]);
    });

    it("should initialize with the provided output plugins", () => {
      const mockPlugin = { name: "mockPlugin" } as IBeltPluginOutput<number>;
      const processEngine = new ProcessEngine<string, number, Error>({
        plugins: [mockPlugin],
      });
      const spyProcessEnginePlugins = jest.mocked(
        (processEngine as any).plugins
      );

      expect(spyProcessEnginePlugins).toEqual([mockPlugin]);
    });

    it("should initialize with the provided error plugins", () => {
      const mockPlugin = { name: "mockPlugin" } as IBeltPluginError<Error>;
      const processEngine = new ProcessEngine<string, string, Error>({
        plugins: [mockPlugin],
      });
      const spyProcessEnginePlugins = jest.mocked(
        (processEngine as any).plugins
      );

      expect(spyProcessEnginePlugins).toEqual([mockPlugin]);
    });

    it("should initialize with the provided multi-type plugins", () => {
      const mockPluginInputOutput = {
        name: "mockPlugin",
      } as IBeltPluginInput<number> & IBeltPluginOutput<string>;
      const processEngine = new ProcessEngine<number, string, Error>({
        plugins: [mockPluginInputOutput],
      });
      const spyProcessEnginePlugins = jest.mocked(
        (processEngine as any).plugins
      );

      expect(spyProcessEnginePlugins).toEqual([mockPluginInputOutput]);
    });

    it("should initialize with the provided plugins of different types", () => {
      const mockPluginInput = {
        name: "mockPlugin",
      } as IBeltPluginInput<string>;
      const mockPluginOutput = {
        name: "mockPlugin",
      } as IBeltPluginOutput<number>;
      const mockPluginError = { name: "mockPlugin" } as IBeltPluginError<Error>;
      const mockPluginInputOutput = {
        name: "mockPlugin",
      } as IBeltPluginInput<string> & IBeltPluginOutput<number>;
      const mockPluginInputError = {
        name: "mockPlugin",
      } as IBeltPluginInput<string> & IBeltPluginError<Error>;
      const mockPluginOutputError = {
        name: "mockPlugin",
      } as IBeltPluginOutput<number> & IBeltPluginError<Error>;
      const mockPluginInputOutputError = {
        name: "mockPlugin",
      } as IBeltPluginInput<number> &
        IBeltPluginOutput<string> &
        IBeltPluginError<Error>;
      const processEngine = new ProcessEngine<string, number, Error>({
        plugins: [
          mockPluginInput,
          mockPluginOutput,
          mockPluginError,
          mockPluginInputOutput,
          mockPluginInputError,
          mockPluginOutputError,
          mockPluginInputOutputError,
        ],
      });
      const spyProcessEnginePlugins = jest.mocked(
        (processEngine as any).plugins
      );

      expect(spyProcessEnginePlugins).toEqual([
        mockPluginInput,
        mockPluginOutput,
        mockPluginError,
        mockPluginInputOutput,
        mockPluginInputError,
        mockPluginOutputError,
        mockPluginInputOutputError,
      ]);
    });
  });

  describe("during direct execution", () => {
    const processEngine = new ProcessEngine();

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should execute the process function", async () => {
      const spyProcess = jest
        .spyOn(processEngine as any, "process")
        .mockResolvedValueOnce("1");

      await processEngine.execute(1);

      expect(spyProcess).toHaveBeenCalled();
    });

    it("should throw an error if the process function is not implemented", async () => {
      await expect(processEngine.execute(1)).rejects.toThrow(
        processFunctionNotImplementedError
      );
    });
  });

  describe("during general extended execution", () => {
    let processEngine: ProcessEngine<number, number, Error>;

    beforeEach(() => {
      processEngine = new ProcessEngine<number, number, Error>();
      jest.clearAllMocks();
      jest
        .spyOn(processEngine as any, "process")
        .mockImplementation((item: any) => {
          return item as number;
        });
    });

    it("should run single use plugins", async () => {
      const sum1Plugin = {
        name: "sum1Plugin",
        processInput: jest.fn().mockImplementation((item: number) => item + 1),
      } as IBeltPluginInput<number>;
      const subtract1Plugin = {
        name: "subtract1Plugin",
        processOutput: jest.fn().mockImplementation((item: number) => item - 1),
      } as IBeltPluginOutput<number>;

      const pureExecutionResult = await processEngine.execute(1, {});
      const singleUseSum1Result = await processEngine.execute(1, {
        singleUsePlugins: [sum1Plugin],
      });
      const singleUseSubtract1Result = await processEngine.execute(1, {
        singleUsePlugins: [subtract1Plugin],
      });

      expect(pureExecutionResult).toBe(1);
      expect(singleUseSum1Result).toBe(2);
      expect(singleUseSubtract1Result).toBe(0);
    });
  });

  describe("during input belt execution", () => {
    let processEngine: ProcessEngine<number, number, Error>;

    beforeEach(() => {
      processEngine = new ProcessEngine<number, number, Error>();
      jest.clearAllMocks();
      jest
        .spyOn(processEngine as any, "process")
        .mockImplementation((item: any) => {
          return item as number;
        });
    });

    it("should run the input belt function", async () => {
      const spyRunInputBelt = jest.spyOn(processEngine as any, "runInputBelt");

      await processEngine.execute(1);

      expect(spyRunInputBelt).toHaveBeenCalled();
    });

    it("should execute the input belt with the provided item and id", async () => {
      const spyRunInputBelt = jest.spyOn(processEngine as any, "runInputBelt");
      const mockedPlugin = {
        name: "mockedPlugin",
        processInput: jest
          .fn()
          .mockImplementationOnce(
            (item: number, metadataHelper: MetadataHelper) => {
              return Number(metadataHelper.itemId);
            }
          ),
      } as IBeltPluginInput<number>;
      (processEngine as any).plugins = [mockedPlugin];

      const output = await processEngine.execute(1, { existingItemId: "25" });

      expect(output).toBe(25);
    });

    it("should return the result of the input belt as input to process", async () => {
      const spyRunInputBelt = jest
        .spyOn(processEngine as any, "runInputBelt")
        .mockResolvedValue(2);
      const spyProcess = jest.spyOn(processEngine as any, "process");

      const result = await processEngine.execute(1);

      expect(result).toBe(2);
    });

    it("should run the input belt plugins", async () => {
      const spyRunInputBelt = jest.spyOn(processEngine as any, "runInputBelt");
      const mockedPlugin = {
        name: "mockedPlugin",
        processInput: jest.fn(),
      } as IBeltPluginInput<number>;
      (processEngine as any).plugins = [mockedPlugin];

      await processEngine.execute(1);

      expect(mockedPlugin.processInput).toHaveBeenCalled();
    });
  });

  describe("during output belt execution", () => {
    let processEngine: ProcessEngine<number, number, Error>;

    beforeEach(() => {
      processEngine = new ProcessEngine<number, number, Error>();
      jest.clearAllMocks();
      jest
        .spyOn(processEngine as any, "process")
        .mockImplementation((item: any) => {
          return item as number;
        });
    });

    it("should run the output belt function", async () => {
      const spyRunOutputBelt = jest.spyOn(
        processEngine as any,
        "runOutputBelt"
      );

      await processEngine.execute(1);

      expect(spyRunOutputBelt).toHaveBeenCalled();
    });

    it("should return the result of the output belt as the final output", async () => {
      const spyRunOutputBelt = jest
        .spyOn(processEngine as any, "runOutputBelt")
        .mockResolvedValue(2);

      const result = await processEngine.execute(1, {
        existingItemId: "mocked-id",
      });

      expect(result).toEqual(2);
    });

    it("should run the output belt plugins", async () => {
      const spyRunOutputBelt = jest.spyOn(
        processEngine as any,
        "runOutputBelt"
      );
      const mockedPlugin = {
        name: "mockedPlugin",
        processOutput: jest.fn(),
      } as IBeltPluginOutput<number>;
      (processEngine as any).plugins = [mockedPlugin];

      await processEngine.execute(1);

      expect(mockedPlugin.processOutput).toHaveBeenCalled();
    });
  });

  describe("during error belt execution", () => {
    let processEngine: ProcessEngine<number, number, Error>;

    beforeEach(() => {
      processEngine = new ProcessEngine<number, number, Error>();
      jest.clearAllMocks();
    });

    it("should run the error belt function", async () => {
      const spyRunErrorBelt = jest.spyOn(processEngine as any, "runErrorBelt");

      await expect(processEngine.execute(1)).rejects.toThrow();

      expect(spyRunErrorBelt).toHaveBeenCalled();
    });

    it("should run the error belt plugins", async () => {
      const spyRunErrorBelt = jest.spyOn(processEngine as any, "runErrorBelt");
      const mockedPlugin = {
        name: "mockedPlugin",
        processError: jest
          .fn()
          .mockImplementation((error) => new Error("mocked modified error")),
      } as IBeltPluginError<Error>;
      (processEngine as any).plugins = [mockedPlugin];

      await expect(
        processEngine.execute(1, { existingItemId: "mocked-id" })
      ).rejects.toThrow("mocked modified error");

      expect(mockedPlugin.processError).toHaveBeenCalled();
    });

    it("should enrich a thrown convee error", async () => {
      const spyProcessFn = jest
        .spyOn(processEngine as any, "process")
        .mockImplementationOnce(() => {
          const error = new ConveeError<Error>({
            message: "mocked error",
            error: new Error("mocked error"),
          });

          error.enrichConveeStack({
            source: "mocked",
            type: "mocked",
            itemId: "mocked",
          });

          throw error;
        });

      await processEngine
        .execute(1, { existingItemId: "mocked-id" })
        .catch((error) => {
          expect(error.engineStack.length).toEqual(2);
        });
    });
  });
});
