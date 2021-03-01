import { fetchAddr } from '../../backend/backUtils';
import { ConstraintSet } from '../../backend/constraintSet';
import { Constraint } from '../../backend/constraintType';
import { Context, ContextSet } from '../../backend/context';
import { absExpIndexByLen, fetchSize, isSize, simplifyBool, simplifyNum, simplifyShape } from '../../backend/expUtils';
import { CodeSource, ShValue, SVAddr, SVNone, SVObject, SVSize, SVType } from '../../backend/sharpValues';
import { BoolOpType, ExpBool, ExpNum, ExpShape, NumBopType, NumOpType } from '../../backend/symExpressions';
import { TorchBackend } from '../../backend/torchBackend';
import { LCImpl } from '..';
import { LCBase } from '../libcall';

export namespace NumpyLCImpl {
    export function ndarrayInit(ctx: Context<LCBase.ExplicitParams>, source?: CodeSource): ContextSet<ShValue> {
        // A replica of torch.tensorInit() in torch/index.ts
        // internally, numpy.ndarray shares structure with torch.Tensor.

        const params = ctx.retVal.params;
        if (params.length !== 7) {
            return ctx
                .warnWithMsg(
                    `from 'LibCall.numpy.ndarrayInit': got insufficient number of argument: ${params.length}`,
                    source
                )
                .toSet();
        }

        const heap = ctx.heap;
        const [selfAddr, shapeAddr, dtypeAddr] = params;

        // TODO: use dtype

        // ndarrayInit is always used in ndarray.__init__ -> force casting
        const addr = selfAddr as SVAddr;
        const self = fetchAddr(selfAddr, heap)! as SVObject;
        const shapeSV = fetchAddr(shapeAddr as SVAddr, heap)! as SVObject;

        // if args is object that has 'shape'
        if (shapeSV?.type === SVType.Object) {
            let size: ShValue | undefined = shapeSV;
            if (size.shape === undefined) {
                size = fetchAddr(shapeSV.getAttr('shape'), heap);
            }

            if (size && size.type === SVType.Object && size?.shape !== undefined) {
                const newHeap = heap.setVal(addr, self.setAttr('shape', size));
                return ctx.setHeap(newHeap).setRetVal(SVNone.create()).toSet();
            }
        }

        // if args is list of integer
        return ctx.parseSize(shapeSV, source).map((ctx) => {
            let shape: ExpShape;
            let newCtx: Context<any> = ctx;
            if (typeof ctx.retVal === 'string') {
                newCtx = ctx.addLog(ctx.retVal, source).genIntGte('tempRank', 0, source);
                shape = ExpShape.fromSymbol(newCtx.genSymShape('tempShape', newCtx.retVal, source));
            } else {
                shape = ctx.retVal;
            }

            const size = SVSize.createSize(ctx, shape, source);
            const newHeap = heap.setVal(addr, self.setAttr('shape', size));

            return newCtx.setHeap(newHeap);
        });
    }

    // A replica of torch.identityShape() in torch/index.ts
    export function identityShape(ctx: Context<LCBase.ExplicitParams>, source?: CodeSource): ContextSet<ShValue> {
        const params = ctx.retVal.params;
        if (params.length !== 1) {
            return ctx.warnTensorWithMsg(
                `from 'LibCall.numpy.identityShape': got insufficient number of argument: ${params.length}`,
                source
            );
        }

        const heap = ctx.heap;
        const inputAddr = params[0];

        const inputSize = fetchSize(inputAddr, heap);

        if (typeof inputSize === 'string') {
            return ctx.warnTensorWithMsg(`from 'LibCall.numpy.identityShape': ${inputSize}`, source);
        }

        const inputShape = inputSize.shape;

        return genNdarray(ctx, inputShape, source);
    }

    // A replica of torch.broadcast() in torch/index.ts
    export function broadcast(ctx: Context<LCBase.ExplicitParams>, source?: CodeSource): ContextSet<ShValue> {
        const params = ctx.retVal.params;
        if (params.length !== 2) {
            return ctx.warnTensorWithMsg(
                `from 'LibCall.numpy.broadcast': got insufficient number of argument: ${params.length}`,
                source
            );
        }

        const heap = ctx.heap;
        const [leftAddr, rightAddr] = params;

        const leftSize = fetchSize(leftAddr, heap);
        const rightSize = fetchSize(rightAddr, heap);

        if (typeof leftSize === 'string') {
            return ctx.warnTensorWithMsg(`from 'LibCall.numpy.broadcast': ${leftSize}`, source);
        } else if (typeof rightSize === 'string') {
            return ctx.warnTensorWithMsg(`from 'LibCall.numpy.broadcast': ${rightSize}`, source);
        }

        const leftShape = leftSize.shape;
        const rightShape = rightSize.shape;

        return ctx.shBroadcast(leftShape, rightShape, source).flatMap((ctx) => genNdarray(ctx, ctx.retVal, source));
    }

    // A replica of torch.matmul() in torch/index.ts
    export function matmul(ctx: Context<LCBase.ExplicitParams>, source?: CodeSource): ContextSet<ShValue> {
        const params = ctx.retVal.params;
        if (params.length !== 2) {
            return ctx.warnTensorWithMsg(
                `from 'LibCall.numpy.matmul': got insufficient number of argument: ${params.length}`,
                source
            );
        }

        const heap = ctx.heap;
        const [leftAddr, rightAddr] = params;

        const leftSize = fetchSize(leftAddr, heap);
        const rightSize = fetchSize(rightAddr, heap);

        if (typeof leftSize === 'string') {
            return ctx.warnTensorWithMsg(`from 'LibCall.numpy.matmul': ${leftSize}`, source);
        } else if (typeof rightSize === 'string') {
            return ctx.warnTensorWithMsg(`from 'LibCall.numpy.matmul': ${rightSize}`, source);
        }

        const leftShape = leftSize.shape;
        const rightShape = rightSize.shape;
        const leftRank = leftSize.rank();
        const rightRank = rightSize.rank();

        return ctx
            .require(
                [ctx.genLte(1, leftRank, source), ctx.genLte(1, rightRank, source)],
                `from 'LibCall.numpy.matmul': cannot do matmul with scalar tensor`,
                source
            )
            .flatMap((ctx) => {
                const isLeftRankOne = ctx.genEq(1, leftRank, source);
                const [leftOnePath, leftTwoPath] = ctx.ifThenElse(isLeftRankOne, source);

                const leftPath = leftOnePath.flatMap((ctx) => {
                    const isRightRankOne = ctx.genEq(1, rightRank, source);
                    const [rightOnePath, rightTwoPath] = ctx.ifThenElse(isRightRankOne, source);

                    const lr11 = rightOnePath
                        .flatMap((ctx) => {
                            const sameDim = ctx.genEq(ExpNum.index(leftShape, 0), ExpNum.index(rightShape, 0), source);
                            return ctx.require(
                                [sameDim],
                                `from 'LibCall.numpy.matmul': dimension mismatch between rank-1 tensors`,
                                source
                            );
                        })
                        .flatMap((ctx) => genNdarray(ctx, ExpShape.fromConst(0, [], source), source));

                    const rightAxis = ExpNum.bop(NumBopType.Sub, rightRank, 2);
                    const lr12 = rightTwoPath
                        .flatMap((ctx) => {
                            const sameDim = ctx.genEq(
                                ExpNum.index(leftShape, 0),
                                ExpNum.index(rightShape, rightAxis),
                                source
                            );
                            return ctx.require(
                                [sameDim],
                                `from 'LibCall.numpy.matmul: dimension mismatch between rank-1 @ rank-n`
                            );
                        })
                        .flatMap((ctx) => ctx.shReduce(rightShape, rightAxis, source))
                        .flatMap((ctx) => genNdarray(ctx, ctx.retVal, source));

                    return lr11.join(lr12);
                });

                const rightPath = leftTwoPath.flatMap((ctx) => {
                    const isRightRankOne = ctx.genEq(1, rightRank, source);
                    const [rightOnePath, rightTwoPath] = ctx.ifThenElse(isRightRankOne, source);

                    const leftAxis = ExpNum.bop(NumBopType.Sub, leftRank, 1, source);
                    const lr21 = rightOnePath
                        .flatMap((ctx) => {
                            const sameDim = ctx.genEq(
                                ExpNum.index(leftShape, leftAxis),
                                ExpNum.index(rightShape, 0),
                                source
                            );
                            return ctx.require(
                                [sameDim],
                                `from 'LibCall.numpy.matmul': dimension mismatch between rank-n @ rank-1`,
                                source
                            );
                        })
                        .flatMap((ctx) => ctx.shReduce(leftShape, leftAxis, source))
                        .flatMap((ctx) => genNdarray(ctx, ctx.retVal, source));

                    const lr22 = rightTwoPath
                        .flatMap((ctx) => ctx.shMatmul(leftShape, rightShape, source))
                        .flatMap((ctx) => genNdarray(ctx, ctx.retVal, source));

                    return lr21.join(lr22);
                });

                return leftPath.join(rightPath);
            });
    }

    // get `(arrAddr: ndarray, imgAddr: PIL Image)`, set shape of `arr` to SVSize with shape of `img`
    export function fromImage(ctx: Context<LCBase.ExplicitParams>, source?: CodeSource): ContextSet<ShValue> {
        const params = ctx.retVal.params;
        if (params.length !== 2) {
            return ctx
                .warnWithMsg(
                    `from 'LibCall.numpy.fromImage': got insufficient number of argument: ${params.length}`,
                    source
                )
                .toSet();
        }
        const heap = ctx.heap;
        const [arrAddr, imgAddr] = params;
        const arrObj = fetchAddr(arrAddr, heap);
        const arrSize = fetchSize(arrAddr, heap);
        const imgSize = fetchAddr(imgAddr, heap);

        if (arrAddr.type !== SVType.Addr || arrObj?.type !== SVType.Object) {
            return ctx
                .warnWithMsg(
                    `from 'LibCall.numpy.fromImage': not an object type:\n\t${arrAddr.toString()} -> ${arrObj?.toString()}`,
                    source
                )
                .toSet();
        } else if (typeof arrSize === 'string') {
            return ctx.warnWithMsg(`from 'LibCall.numpy.fromImage': ${arrSize}`, source).toSet();
        } else if (imgAddr.type !== SVType.Addr || !isSize(imgSize)) {
            return ctx
                .warnWithMsg(
                    `from 'LibCall.numpy.fromImage': not a size type:\n\t${imgAddr.toString()} -> ${imgSize?.toString()}`,
                    source
                )
                .toSet();
        }
        const channel = ExpShape.fromConst(1, [ExpNum.index(imgSize.shape, 0, source)], source);
        const widthHeight = ExpShape.slice(imgSize.shape, 1, 3, source);
        const newShape = ExpShape.concat(widthHeight, channel, source);
        const newSize = SVSize.fromObject(ctx, arrSize, newShape);
        const newArr = arrObj.setAttr('shape', newSize);

        const newHeap = heap.setVal(arrAddr, newArr);
        return ctx.setHeap(newHeap).toSetWith(newArr);
    }

    // Assumption: "tensors" is a constantRanked sequence, and each element is available.
    // TODO: handle empty tensor.
    export function concatenate(ctx: Context<LCBase.ExplicitParams>, source?: CodeSource): ContextSet<ShValue> {
        const params = ctx.retVal.params;
        if (params.length !== 2) {
            return ctx
                .warnWithMsg(
                    `from 'LibCall.numpy.concatenate': got insufficient number of argument: ${params.length}`,
                    source
                )
                .toSet();
        }

        const heap = ctx.heap;
        const [seqAddr, axisAddr] = params;

        const seq = fetchAddr(seqAddr, heap);
        const axisSV = fetchAddr(axisAddr, heap);

        if (seq?.type !== SVType.Object) {
            return ctx.warnWithMsg(`from 'LibCall.numpy.concatenate': array sequence is not iterable`, source).toSet();
        } else if (axisSV?.type !== SVType.Int) {
            return ctx.warnWithMsg(`from 'LibCall.numpy.concatenate': axis is not an integer`, source).toSet();
        }

        // Assumption: length of "tensors" is constant.
        const seqLen_ = fetchAddr(seq.getAttr('$length'), heap);
        if (!(seqLen_?.type === SVType.Int && typeof seqLen_.value === 'number')) {
            return ctx
                .warnWithMsg(
                    `from 'LibCall.numpy.concatenate': length of array sequence is unknown, cannot iterate.`,
                    source
                )
                .toSet();
        } else if (seqLen_.value === 0) {
            return ctx
                .warnWithMsg(`from 'LibCall.numpy.concatenate': length of array sequence is zero.`, source)
                .toSet();
        }
        const seqLen = seqLen_.value;

        const size0 = fetchSize(seq.getIndice(0), heap);
        if (typeof size0 === 'string') {
            return ctx.warnWithMsg(`from 'LibCall.numpy.concatenate': ${size0}`, source).toSet();
        }
        const size0shape = size0.shape;
        const size0rank = size0.rank();
        const axis = absExpIndexByLen(axisSV.value, size0rank, source);
        const shape0Front = ExpShape.slice(size0shape, 0, axis, source);
        const shape0Back = ExpShape.slice(size0shape, ExpNum.bop(NumBopType.Add, axis, 1), size0rank, source);

        // TODO: handle negative index.
        const ctrs: Constraint[] = [ctx.genLte(0, axis, source), ctx.genLt(axis, size0rank)];
        let thickness: ExpNum = ExpNum.index(size0shape, axis, source);

        for (let i = 1; i < seqLen; i++) {
            const sizeI = fetchSize(seq.getIndice(i), heap);
            if (typeof sizeI === 'string') {
                return ctx.warnTensorWithMsg(`from 'LibCall.numpy.concatenate': ${sizeI}`, source);
            }
            const sizeIshape = sizeI.shape;
            const shapeIFront = ExpShape.slice(sizeIshape, 0, axis, source);
            const shapeIBack = ExpShape.slice(sizeIshape, ExpNum.bop(NumBopType.Add, axis, 1), size0rank, source);

            ctrs.push(ctx.genEq(shape0Front, shapeIFront, source));
            ctrs.push(ctx.genEq(shape0Back, shapeIBack, source));
            thickness = ExpNum.bop(NumBopType.Add, thickness, ExpNum.index(sizeIshape, axis, source));
        }

        const shapeThick = ExpShape.fromConst(1, [thickness], source);
        const returnShape_ = ExpShape.concat(shape0Front, shapeThick, source);
        const returnShape = ExpShape.concat(returnShape_, shape0Back, source);

        return ctx
            .require(ctrs, `from 'LibCall.numpy.concatenate': shapes must match, axis must be within rank`, source)
            .flatMap((ctx) => {
                return genNdarray(ctx, returnShape);
            });
    }

    export function copyOut(ctx: Context<LCBase.ExplicitParams>, source?: CodeSource): ContextSet<ShValue> {
        const params = ctx.retVal.params;
        if (params.length !== 2) {
            return ctx
                .warnWithMsg(
                    `from 'LibCall.numpy.copyOUt': got insufficient number of argument: ${params.length}`,
                    source
                )
                .toSet();
        }

        const heap = ctx.heap;
        const [arrayAddr, outAddr] = params;
        const array = fetchSize(arrayAddr, heap);

        if (outAddr.type === SVType.None) {
            return ctx.toSetWith(outAddr);
        }
        const out = fetchSize(outAddr, heap);
        if (typeof array === 'string') {
            return ctx.warnWithMsg(`from 'LibCall.numpy.copyOut': ${array}`, source).toSet();
        }
        if (typeof out === 'string') {
            return ctx.warnWithMsg(`from 'LibCall.numpy.copyOut': ${out}`, source).toSet();
        }

        return ctx
            .require(
                ctx.genEq(array.shape, out.shape, source),
                `from 'LibCall.numpy.copyOut': shapes must be equal`,
                source
            )
            .return(SVNone.create(source));
    }

    export function reduce(ctx: Context<LCBase.ExplicitParams>, source?: CodeSource): ContextSet<ShValue> {
        const params = ctx.retVal.params;
        if (params.length !== 4) {
            return ctx.warnTensorWithMsg(
                `from 'LibCall.numpy.reduce': got insufficient number of argument: ${params.length}`,
                source
            );
        }

        const heap = ctx.heap;
        const [selfAddr, axisAddr, outAddr, keepdimsAddr] = params;

        const selfSize = fetchSize(selfAddr, heap);
        if (typeof selfSize === 'string') {
            return ctx.warnTensorWithMsg(`from 'LibCall.numpy.reduce': ${selfSize}`, source);
        }
        const selfShape = selfSize.shape;
        const selfRank = selfSize.rank();
        let rankValue: number | undefined = undefined;

        if (typeof selfRank === 'number') {
            rankValue = selfRank;
        } else {
            const selfRank_ = simplifyNum(ctx.ctrSet, selfRank);
            if (selfRank_.opType === NumOpType.Const) {
                rankValue = selfRank_.value;
            }
        }

        const axisSV = fetchAddr(axisAddr, heap);
        const keepdims = fetchAddr(keepdimsAddr, heap);

        if (
            axisSV === undefined ||
            (axisSV.type !== SVType.None && axisSV.type !== SVType.Int && axisSV.type !== SVType.Object)
        ) {
            return ctx.failWithMsg(`from 'LibCall.numpy.reduce': invalid type of axis ${axisSV?.type}`, source).toSet();
        } else if (keepdims === undefined || keepdims.type !== SVType.Bool) {
            return ctx
                .failWithMsg(`from 'LibCall.numpy.reduce': invalid type of keepdims ${keepdims?.type}`, source)
                .toSet();
        }

        let keepdimsVal: boolean;
        if (typeof keepdims.value === 'boolean') {
            keepdimsVal = keepdims.value;
        } else {
            const keepdims_: ExpBool = simplifyBool(ctx.ctrSet, keepdims.value);
            if (keepdims_.opType !== BoolOpType.Const) {
                return ctx.warnTensorWithMsg(
                    `from 'LibCall.numpy.reduce': cannot infer value of keepdims ${keepdims.value}`,
                    source
                );
            }
            keepdimsVal = keepdims_.value;
        }

        // 1) axis is None. return a scalar value.
        if (axisSV.type === SVType.None) {
            if (keepdimsVal) {
                if (rankValue !== undefined) {
                    const dims: number[] = [];
                    for (let i = 0; i < rankValue; i++) {
                        dims.push(1);
                    }
                    const shape = ExpShape.fromConst(rankValue, dims, source);
                    return genNdarray(ctx, shape, source);
                } else {
                    const dim = ctx.genSymInt('dim', source);
                    const ctrEq = ctx.genEq(ExpNum.fromSymbol(dim), 1, source);
                    return ctx.require(ctx.genForall(dim, [0, selfRank], ctrEq, source)).flatMap((ctx) => {
                        return ctx.genRankedShape(selfRank, source).flatMap((ctx) => {
                            const rankedShape = ctx.retVal;
                            return genNdarray(ctx, rankedShape, source);
                        });
                    });
                }
            } else {
                // TODO: data type
                return genNdarray(ctx, ExpShape.fromConst(0, [], source), source);
            }
        }
        // 2) axis is an integer.
        else if (axisSV.type === SVType.Int) {
            const axis = absExpIndexByLen(axisSV.value, selfRank, source, ctx.ctrSet);

            const shapeFront = ExpShape.slice(selfShape, 0, axis, source);
            const shapeBack = ExpShape.slice(selfShape, ExpNum.bop(NumBopType.Add, axis, 1, source), selfRank, source);

            let newShape: ExpShape;
            if (keepdimsVal) {
                const newDim = ExpShape.fromConst(1, [1], source);
                const newShape_ = ExpShape.concat(shapeFront, newDim, source);
                newShape = ExpShape.concat(newShape_, shapeBack, source);
            } else {
                newShape = ExpShape.concat(shapeFront, shapeBack, source);
            }
            return ctx
                .require(
                    [ctx.genLte(0, axis, source), ctx.genLt(axis, selfRank, source)],
                    `from 'LibCall.numpy.reduce': axis must be within rank`,
                    source
                )
                .flatMap((ctx) => {
                    return genNdarray(ctx, newShape, source);
                });
        }
        // 3) axis is a tuple of ints.
        else {
            const axes = getExpNumTuple(axisSV, ctx.ctrSet);
            if (typeof axes === 'string') {
                return ctx.failWithMsg(`from 'LibCall.numpy.reduce': ${axes}`, source).toSet();
            }

            const constAxes: number[] = [];
            axes.forEach((axis) => {
                const axis_ = absExpIndexByLen(axis, selfRank, source);
                if (typeof axis_ === 'number') {
                    constAxes.push(axis_);
                }
            });
            if (axes.length !== constAxes.length) {
                return ctx.failWithMsg(`from 'LibCall.numpy.max': ${axes} has non-const axis`, source).toSet();
            }
            constAxes.sort();

            const shapes: ExpShape[] = [];
            let lastDim: number | ExpNum = -1;
            for (let i = 0; i < constAxes.length; i++) {
                const dim = constAxes[i];
                shapes.push(ExpShape.slice(selfShape, ExpNum.bop(NumBopType.Add, lastDim, 1, source), dim, source));
                if (keepdimsVal) {
                    shapes.push(ExpShape.fromConst(1, [1], source));
                }
                lastDim = dim;
            }
            shapes.push(ExpShape.slice(selfShape, ExpNum.bop(NumBopType.Add, lastDim, 1, source), selfRank, source));
            const shape = shapes.reduce((left, right) => ExpShape.concat(left, right, source));
            return ctx
                .require(
                    [ctx.genLte(0, constAxes[0], source), ctx.genLt(constAxes[constAxes.length - 1], selfRank, source)],
                    `axes must be within rank`,
                    source
                )
                .flatMap((ctx) => {
                    return genNdarray(ctx, shape, source);
                });
        }
    }

    export function flatten(ctx: Context<LCBase.ExplicitParams>, source?: CodeSource): ContextSet<ShValue> {
        const params = ctx.retVal.params;
        if (params.length < 1) {
            return ctx.warnTensorWithMsg(
                `from 'LibCall.torch.flatten': got insufficient number of argument: ${params.length}`,
                source
            );
        }

        const heap = ctx.heap;
        const [inputAddr, startDimAddr, endDimAddr] = params;

        // TODO: use kwargs info.
        // TODO: handle negative indexing

        const inputSize = fetchSize(inputAddr, heap);
        if (typeof inputSize === 'string') {
            return ctx.warnTensorWithMsg(`from 'LibCall.torch.flatten': ${inputSize}`, source);
        }
        const inputShape = inputSize.shape;

        // np.flatten only outputs 1-D array
        const returnShape = ExpShape.fromConst(1, [ExpNum.numel(inputShape, source)], source);

        return ctx.require([]).flatMap((ctx) => genNdarray(ctx, returnShape, source));
    }

    function genNdarray<T>(ctx: Context<T>, shape: ExpShape, source?: CodeSource): ContextSet<ShValue> {
        const newShape = simplifyShape(ctx.ctrSet, shape);

        return TorchBackend.libClassInit(ctx, 'numpy.ndarray', [SVSize.createSize(ctx, newShape, source)], source);
    }

    // return tuple of ExpNums from SVObject.
    function getExpNumTuple(obj: SVObject, ctrSet: ConstraintSet): (number | ExpNum)[] | string {
        const length = obj.getAttr('$length');
        if (length === undefined || !(length.type === SVType.Int)) {
            return `attribute '$length' is not an int`;
        }

        let len = typeof length.value === 'number' ? length.value : simplifyNum(ctrSet, length.value);
        if (typeof len !== 'number' && !(len.opType === NumOpType.Const)) {
            return `length is not const`;
        }

        len = typeof len === 'number' ? len : len.value;
        const intTuple: (number | ExpNum)[] = [];
        for (let i = 0; i < len; i++) {
            const elem = obj.getIndice(i);
            if (elem === undefined || elem.type !== SVType.Int) {
                return `an element of tuple is not an int`;
            }
            const num = elem.value;
            intTuple.push(num);
        }
        return intTuple;
    }

    /* Integer array indexing.
     * https://numpy.org/doc/stable/reference/arrays.indexing.html#advanced-indexing
     * assumption: each element of index arrays has no boundary error
     *
     * x = np.array([[ 0,  1,  2],
     *               [ 3,  4,  5],
     *               [ 6,  7,  8],
     *               [ 9, 10, 11]])
     * rows = np.array([[0, 0],
     *                  [3, 3]], dtype=np.intp)
     * columns = np.array([[0, 2],
     *                     [0, 2]], dtype=np.intp)
     * x[rows, columns] -> array([[ 0,  2],
     *                            [ 9, 11]])
     */
    export function indexIntarrays(ctx: Context<LCBase.ExplicitParams>, source?: CodeSource): ContextSet<ShValue> {
        const params = ctx.retVal.params;
        if (params.length !== 3) {
            return ctx.warnTensorWithMsg(
                `from 'LibCall.ndarray.indexIntarrays': got insufficient number of argument: ${params.length}`,
                source
            );
        }

        const { env, heap } = ctx;
        const [sizeAddr, lenAddr, arraysAddr] = params;

        const size = fetchAddr(sizeAddr, heap);
        const len = fetchAddr(lenAddr, heap);
        const arrays = fetchAddr(arraysAddr, heap);

        if (!(size && size instanceof SVSize)) {
            return ctx.warnWithMsg(`from 'LibCall.ndarray.indexIntarrays': input is not a Size type`, source).toSet();
        }
        if (len?.type !== SVType.Int) {
            return ctx.warnTensorWithMsg(`from 'LibCall.ndarray.indexIntarrays': ${len}`, source);
        }
        if (arrays?.type !== SVType.Object) {
            return ctx.warnTensorWithMsg(`from 'LibCall.ndarray.indexIntarrays': ${arrays}`, source);
        }

        // TODO: broadcasting, check all shapes of indice
        const first = arrays.getIndice(0);
        const firstSize = fetchSize(first, heap);
        if (typeof firstSize === 'string') {
            return ctx.warnTensorWithMsg(`from 'LibCall.ndarray.indexIntarrays': ${firstSize}`, source);
        }
        const elemShape = ExpShape.slice(size.shape, len.value, size.rank(), source);
        const indexShape = firstSize.shape;

        return ctx
            .require(
                [ctx.genLte(len.value, size.rank(), source)],
                `from 'LibCall.ndarray.indexIntarrays: too many indices.`,
                source
            )
            .flatMap((ctx) => {
                return genNdarray(ctx, ExpShape.concat(indexShape, elemShape, source), source);
            });
    }

    export function indexBoolarray(ctx: Context<LCBase.ExplicitParams>, source?: CodeSource): ContextSet<ShValue> {
        const params = ctx.retVal.params;
        if (params.length !== 2) {
            return ctx.warnTensorWithMsg(
                `from 'LibCall.ndarray.indexIntarray': got insufficient number of argument: ${params.length}`,
                source
            );
        }

        const { env, heap } = ctx;
        const [sizeAddr, boolarrAddr] = params;

        const size = fetchAddr(sizeAddr, heap);
        const boolarray = fetchSize(boolarrAddr, heap);

        if (!(size && size instanceof SVSize)) {
            return ctx.warnWithMsg(`from 'LibCall.ndarray.indexIntarray': input is not a Size type`, source).toSet();
        }
        if (typeof boolarray === 'string') {
            return ctx.warnTensorWithMsg(`from 'LibCall.ndarray.indexIntarray': ${boolarray}`, source);
        }

        // mask indexing
        const sizeNumel = ExpNum.numel(size.shape, source);
        const mask = boolarray;
        const maskCtx = ctx.genIntGte('indexBoolarray', 0, source);
        const maskNum = maskCtx.retVal;

        return maskCtx
            .require(
                [maskCtx.genLte(maskNum, sizeNumel, source), maskCtx.genEq(size.shape, mask.shape, source)],
                `from 'LibCall.ndarray.indexBoolarray: mask shape mismatch`,
                source
            )
            .flatMap((ctx) => {
                return genNdarray(ctx, ExpShape.fromConst(1, [maskNum], source));
            });
    }

    export const libCallImpls: { [key: string]: LCImpl } = {
        ndarrayInit,
        identityShape,
        broadcast,
        matmul,
        fromImage,
        concatenate,
        copyOut,
        reduce,
        flatten,
        indexIntarrays,
        indexBoolarray,
    };
}

export const libCallMap: Map<string, LCImpl> = new Map([...Object.entries(NumpyLCImpl.libCallImpls)]);
