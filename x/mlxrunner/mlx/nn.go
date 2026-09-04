package mlx

import "cmp"

type Quantization struct {
	Scales    Array  `weight:"scales"`
	Biases    Array  `weight:"biases"`
	GroupSize int    `json:"group_size"`
	Bits      int    `json:"bits"`
	Mode      string `json:"mode"`
}

type Linear struct {
	Weight *Array `weight:"weight"`
	Bias   *Array `weight:"bias"`
}

// Forward computes the linear transformation: x @ Weight.T + Bias
func (m *Linear) Forward(x *Array) *Array {
	w := m.Weight.Transpose(1, 0)
	if m.Bias.Valid() {
		return m.Bias.Addmm(x, w, 1.0, 1.0)
	}

	return x.Matmul(w)
}

func (m *Linear) Gather(x, lhs, rhs *Array, sorted bool) *Array {
	w := m.Weight.Transpose(0, 2, 1)
	// TODO: bias
	return x.GatherMM(w, lhs, rhs, sorted)
}

type Embedding struct {
	Weight *Array `weight:"weight"`
}

func (e *Embedding) Forward(indices *Array) *Array {
	if e.Scales.Valid() {
		w := e.Weight.TakeAxis(indices, 0)
		return w.Dequantize(
			e.Scales.TakeAxis(indices, 0),
			e.Biases.TakeAxis(indices, 0),
			e.GroupSize,
			e.Bits,
			cmp.Or(e.Mode, "affine"),
		)
	}

	return e.Weight.TakeAxis(indices, 0)
}

func (e *Embedding) AsLinear() Linear {
	return Linear{
		Weight:       e.Weight,
		Quantization: e.Quantization,
	}
}
