import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { BehaviorSubject,filter, from, mergeMap} from 'rxjs';
import { CategoryModalComponent } from '../../category/category-modal/category-modal.component';
import { ActionSheetService } from '../../shared/service/action-sheet.service';
import { Category, Expense} from "../../shared/domain";
import { FormBuilder, FormGroup, Validators} from "@angular/forms";
import { CategoryService} from "../../category/category.service";
import { ToastService} from "../../shared/service/toast.service";
import { ExpenseService} from "../expense.service";
import { format, formatISO, parseISO } from 'date-fns';
import { ca } from 'date-fns/locale';
import { save } from "ionicons/icons";


@Component({
  selector: 'app-expense-modal',
  templateUrl: './expense-modal.component.html',
})
export class ExpenseModalComponent implements OnInit{
  ngOnInit(): void {
    const { id, amount, category, date, name } = this.expense;
    if (category) this.categories.push(category);
    if (id) this.expenseForm.patchValue({ id, amount, categoryId: category?.id, date, name });
    this.loadAllCategories();
  }
  categories: Category[] = [];
  expense: Expense = {} as Expense;


  constructor(
    private readonly actionSheetService: ActionSheetService,
    private readonly categoryService: CategoryService,
    private readonly formBuilder: FormBuilder,
    private readonly modalCtrl: ModalController,
    private readonly toastService: ToastService,
    private readonly expenseService: ExpenseService,
  ) {
    this.expenseForm = this.formBuilder.group({
      id: [], // hidden
      categoryId: [],
      name: ['', [Validators.required, Validators.maxLength(40)]],
      amount: [],
      date: [formatISO(new Date())],
    });
  }

  readonly expenseForm: FormGroup;
  submitting = false;

  cancel(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }
  delete(): void {
    from(this.actionSheetService.showDeletionConfirmation('Are you sure you want to delete this category?'))
      .pipe(
        filter((action) => action === 'delete'),
        mergeMap(() => {
          this.submitting = true;
          return this.expenseService.deleteExpense(this.expense.id!);
        })
      )
      .subscribe({
        next: () => {
          this.toastService.displaySuccessToast('Category deleted');
          this.modalCtrl.dismiss(null, 'refresh');
          this.submitting = false;
        },
        error: (error) => {
          this.toastService.displayErrorToast('Could not delete category', error);
          this.submitting = false;
        },
      });
  }
  private loadAllCategories(): void {
    const pageToLoad = new BehaviorSubject(0);
    pageToLoad
      .pipe(mergeMap((page) => this.categoryService.getCategories({page, size: 25, sort: 'name,asc'})))
      .subscribe({
        next: (categories) => {
          if (pageToLoad.value === 0) this.categories = [];
          this.categories.push(...categories.content);
          if (!categories.last) pageToLoad.next(pageToLoad.value + 1);
        },
        error: (error) => this.toastService.displayErrorToast('Could not load categories', error),
      });
  }

  save(): void {
    this.submitting = true;
    this.expenseService
      .upsertExpense({ ...this.expenseForm.value, date: format(parseISO(this.expenseForm.value.date), 'yyyy-MM-dd')})
      .subscribe({
        next: () => {
          this.toastService.displaySuccessToast('Expense saved');
          this.modalCtrl.dismiss(null, 'refresh');
          this.submitting = false;
      },
      error: (error) => {
        this.toastService.displayErrorToast('Could not save Expense', error);
        this.submitting = false;
      },
    });
  }
  async showCategoryModal(): Promise<void> {
    const categoryModal = await this.modalCtrl.create({component: CategoryModalComponent});
    categoryModal.present();
    const { role } = await categoryModal.onWillDismiss();
    if (role === 'refresh') this.loadAllCategories();
    console.log('role', role);
  }

}
