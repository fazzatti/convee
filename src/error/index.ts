import { EngineMetadata } from "../core/types.ts";
import { IConveeError, IConveeErrorPayload, ParsedMetadata } from "./types.ts";

export class ConveeError<ErrorT extends Error>
  extends Error
  implements IConveeError<ErrorT>
{
  public engineStack: ParsedMetadata[];

  constructor(args: IConveeErrorPayload<ErrorT>) {
    super(args.message);

    // Restore prototype chain (for instanceof checks to work properly)
    Object.assign(this, args.error); // Copy custom properties

    this.engineStack = [];
  }

  public enrichConveeStack(metadata: EngineMetadata): ConveeError<ErrorT> {
    this.engineStack.push({
      source: metadata.source,
      type: metadata.type,
      itemId: metadata.itemId,
      dataKeys: [...Object.keys(metadata.processMeta || [])],
    });
    return this;
  }
}
