import { EngineMetadata } from "../core/types.ts";
import { IConveeError, IConveeErrorPayload } from "./types.ts";

export class ConveeError<ErrorT extends Error>
  extends Error
  implements IConveeError<ErrorT>
{
  public engineStack: EngineMetadata[];

  constructor(args: IConveeErrorPayload<ErrorT>) {
    super(args.message);

    // Restore prototype chain (for instanceof checks to work properly)
    Object.assign(this, args.error); // Copy custom properties

    this.engineStack = [];
  }

  public enrichConveeStack(metadata: EngineMetadata): ConveeError<ErrorT> {
    this.engineStack.push(metadata);
    return this;
  }
}
