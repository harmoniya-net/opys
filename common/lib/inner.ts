import { Class, transform, instanceOf } from 'effect/Schema';
import type * as Schema from 'effect/Schema';

export function InnerClass<Self>(tag: string) {
  return <A, I, R>(innerSchema: Schema.Schema<A, I, R>) => {
    const Base = Class<Self>(tag)({
      inner: innerSchema,
    });

    class Inner extends (Base as any) {
      static encode(inst: any): any {
        return inst.inner;
      }
      static decode(val: any): any {
        return new (this as any)({ inner: val });
      }
    }

    let _cachedAST: any = null;

    Object.defineProperty(Inner, 'ast', {
      get(this: any) {
        if (!_cachedAST) {
          const klass = this;
          const transformSchema = transform(
            innerSchema as any,
            instanceOf(klass) as any,
            {
              decode: (val: any) => klass.decode(val),
              encode: (inst: any) => klass.encode(inst),
              strict: false,
            },
          );
          _cachedAST = (transformSchema as any).ast;
        }
        return _cachedAST;
      },
      configurable: true,
      enumerable: true,
    });

    return Inner as unknown as typeof Base;
  };
}
