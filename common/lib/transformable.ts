import { Class, transform, instanceOf } from 'effect/Schema';
import type * as Schema from 'effect/Schema';

export function TransformableClass<Self>(tag: string) {
  return <Fields extends Schema.Struct.Fields>(
    fields: Fields,
    encodedSchema: Schema.Schema.All,
  ) => {
    const Base = Class<Self>(tag)(fields);

    class Transformable extends (Base as any) {
      static encode(_inst: any): any {
        throw new Error(`static encode() must be implemented for ${tag}`);
      }
      static decode(_val: any): any {
        throw new Error(`static decode() must be implemented for ${tag}`);
      }
    }

    let _cachedAST: any = null;

    Object.defineProperty(Transformable, 'ast', {
      get(this: any) {
        if (!_cachedAST) {
          const klass = this;
          // We use instanceOf(klass) to avoid infinite recursion while still
          // telling Effect that the output of this transform is an instance of our class.
          const transformSchema = transform(
            encodedSchema as any,
            instanceOf(klass) as any,
            {
              decode: (val: any) => klass.decode(val),
              encode: (inst: any) => klass.encode(inst),
              strict: false, // Don't strip properties from our class instances
            },
          );
          _cachedAST = (transformSchema as any).ast;
        }
        return _cachedAST;
      },
      configurable: true,
      enumerable: true,
    });

    return Transformable as unknown as typeof Base;
  };
}
