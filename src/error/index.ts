import { EngineMetadata } from "../core/types";
import { IConveeError, IConveeErrorPayload } from "./types";

export class ConveeError<ErrorT extends Error>
  extends Error
  implements IConveeError<ErrorT>
{
  public engineStack: EngineMetadata[];
  public sourceError: ErrorT;

  constructor(args: IConveeErrorPayload<ErrorT>) {
    super(args.message);

    // Restore prototype chain (for instanceof checks to work properly)
    Object.setPrototypeOf(this, new.target.prototype);

    this.sourceError = args.error;
    this.engineStack = [];
  }

  public enrichConveeStack(metadata: EngineMetadata): ConveeError<ErrorT> {
    this.engineStack.push(metadata);
    return this;
  }
}
